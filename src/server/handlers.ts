import "@/lib/zod-config";
import "server-only";
import { z, type ZodType } from "zod";
import {
  admitCase,
  admitCounters,
  attemptCounters,
  finishModelCall,
  keys,
  LIMITS,
  recordAttempt,
  reserveCounters,
  reserveModelCall,
  type Counter,
} from "@/lib/budgets";
import { hashOf, hmacHex } from "@/lib/crypto";
import type { AppConfig } from "@/lib/config";
import { buildEvidenceMap } from "@/lib/evidence";
import { checkHeaders, readJsonBody, type GuardFailure } from "@/lib/guard";
import type { ModelProvider } from "@/lib/ai";
import { interpretDiagnosis, interpretTriage } from "@/lib/interpret";
import { prepareDiagnoseInput } from "@/lib/diagnose-input";
import { PROMPT_VERSION, triageMessages, type ChatMessages } from "@/lib/prompts";
import type { Store } from "@/lib/redis";
import { answersSchema, intakeSchema, questionSchema } from "@/lib/schemas";
import type { Intake } from "@/lib/schemas";
import { findLikelySecret } from "@/lib/secrets";
import {
  buildSetCookie,
  cookieName,
  createSessionCookie,
  parseSessionCookie,
} from "@/lib/sessions";
import { signTicket, verifyTicket } from "@/lib/tickets";
import { estimateTokens, MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS } from "@/lib/tokens";
import { checkTurnstile } from "@/lib/turnstile";

/* ---------- Dependencies (injected) ---------- */

export type LogEvent = {
  requestId: string;
  stage: "session" | "triage" | "diagnose";
  outcome: string;
  latencyMs: number;
  promptVersion?: string;
  model?: string;
  totalTokens?: number;
  /** How many playbook reference sections were placed in the prompt. */
  references?: number;
  /** Fixed-vocabulary reason for a failed challenge (a Cloudflare error code or which comparison failed). */
  detail?: string;
};

export type Deps = {
  config: AppConfig;
  store: Store;
  provider: ModelProvider;
  fetch: typeof fetch;
  now: () => number;
  randomId: () => string;
  clientIp: (req: Request) => string | null;
  log: (e: LogEvent) => void;
  providerDeadlineMs?: number;
};

/* ---------- Responses ---------- */

export type Category =
  | GuardFailure
  | "secret_detected"
  | "challenge_failed"
  | "consent_required"
  | "rate_limited"
  | "already_completed"
  | "case_state"
  | "live_disabled"
  | "capacity_reached"
  | "provider_unavailable"
  | "invalid_result";

const FAILURES: Record<Category, [number, string]> = {
  invalid_request: [400, "The request could not be accepted."],
  secret_detected: [400, "The text looks like it contains a credential. Remove it and try again."],
  forbidden: [403, "This request is not allowed."],
  challenge_failed: [403, "The challenge could not be verified. Please try again."],
  consent_required: [403, "Please accept the current terms and privacy notice."],
  too_large: [413, "The request is too large."],
  rate_limited: [429, "Too many requests. Please wait and try again."],
  already_completed: [409, "This case has already been completed."],
  case_state: [409, "This case cannot take that step right now."],
  live_disabled: [503, "Live assessments are unavailable right now. Try a sample patient."],
  capacity_reached: [503, "The hospital is busy. Try a sample patient."],
  provider_unavailable: [503, "A required service is unavailable. Try a sample patient."],
  invalid_result: [502, "The assessment could not be completed safely. Try a sample patient."],
};

const outcomes = new WeakMap<Response, string>();

function respond(body: unknown, status: number, requestId: string, extra: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId, ...extra },
  });
}

function fail(category: Category, requestId: string, retryAfterSec?: number): Response {
  const [status, message] = FAILURES[category];
  const res = respond(
    { error: category, message, requestId, ...(retryAfterSec ? { retryAfterSec } : {}) },
    status,
    requestId,
    retryAfterSec ? { "Retry-After": String(retryAfterSec) } : {},
  );
  outcomes.set(res, category);
  return res;
}

/** A 403 that records which check refused it. The visitor gets the same generic answer either way. */
function forbid(deps: Deps, stage: LogEvent["stage"], requestId: string, detail: string): Response {
  deps.log({ requestId, stage, outcome: "forbidden_detail", latencyMs: 0, detail });
  return fail("forbidden", requestId);
}

function denyCounter(c: Counter, requestId: string): Response {
  if (c.scope !== "global") return fail("rate_limited", requestId, c.retryAfterSec);
  // A global per-minute cap clears within a minute, so say when; day and month caps point to the samples.
  return fail("capacity_reached", requestId, c.retryAfterSec <= 60 ? c.retryAfterSec : undefined);
}

/* ---------- Shared pipeline ---------- */

type Ctx = { deps: Deps; requestId: string; ipHash: string };

const tokenField = z.string().min(1).max(2048);
const caseIdField = z.string().regex(/^[A-Za-z0-9_-]{22}$/);

const sessionRequest = z.strictObject({
  turnstileToken: tokenField,
  terms: z.strictObject({
    accepted: z.literal(true),
    termsVersion: z.string().max(40),
    privacyVersion: z.string().max(40),
  }),
});

const triageRequest = z.strictObject({
  caseId: caseIdField,
  intake: intakeSchema,
  turnstileToken: tokenField,
});

const diagnoseRequest = z.strictObject({
  caseId: caseIdField,
  intake: intakeSchema,
  questions: z.array(questionSchema).max(3),
  answers: answersSchema,
  ticket: z.string().min(1).max(1024),
  turnstileToken: tokenField,
});

/**
 * Cheap checks first, then the per-IP attempt gate, then the body. Nothing here calls Turnstile
 * or the model. Any dependency failure means "unavailable", never "skip the check".
 */
async function gate<T>(
  req: Request,
  deps: Deps,
  requestId: string,
  schema: ZodType<T>,
): Promise<Response | { ctx: Ctx; body: T }> {
  const { config } = deps;
  if (!config.live) return fail("live_disabled", requestId);

  const headerFailure = checkHeaders(req, config.origin);
  if (headerFailure) return fail(headerFailure, requestId);

  const ip = deps.clientIp(req);
  if (!ip) return fail("live_disabled", requestId);
  const ipHash = hmacHex(config.secrets.ip, "ip", ip);

  try {
    const attempt = await recordAttempt(deps.store, attemptCounters(config.namespace, ipHash, deps.now()));
    if (!attempt.ok) return denyCounter(attempt.counter, requestId);
    if ((await deps.store.get(keys.kill(config.namespace))) === "1") return fail("live_disabled", requestId);
  } catch {
    return fail("provider_unavailable", requestId);
  }

  const body = await readJsonBody(req);
  if (!body.ok) return fail(body.failure, requestId);
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return fail("invalid_request", requestId);
  return { ctx: { deps, requestId, ipHash }, body: parsed.data };
}

async function authSession(req: Request, ctx: Ctx, stage: LogEvent["stage"]): Promise<Response | { sessionHash: string }> {
  const { config, store } = ctx.deps;
  const sessionHash = parseSessionCookie(
    req.headers.get("cookie"),
    cookieName(config.secureCookies),
    config.secrets.session,
  );
  if (!sessionHash) return forbid(ctx.deps, stage, ctx.requestId, "no_session_cookie");
  try {
    const rec = await store.hgetall(keys.session(config.namespace, sessionHash));
    if (!rec) return forbid(ctx.deps, stage, ctx.requestId, "session_not_in_store");
    if (rec.terms !== config.termsVersion || rec.privacy !== config.privacyVersion) {
      return fail("consent_required", ctx.requestId);
    }
  } catch {
    return fail("provider_unavailable", ctx.requestId);
  }
  return { sessionHash };
}

async function challenge(
  ctx: Ctx,
  token: string,
  action: "admission" | "triage" | "diagnose",
  cdata?: string,
): Promise<boolean> {
  const { config, fetch: fetchImpl } = ctx.deps;
  const result = await checkTurnstile({
    token,
    secret: config.secrets.turnstile,
    action,
    hostname: config.hostname,
    cdata,
    fetchImpl,
  });
  if (!result.ok) {
    // The visitor only ever sees "challenge failed"; the reason goes to the operator logs.
    ctx.deps.log({
      requestId: ctx.requestId,
      stage: action === "admission" ? "session" : action,
      outcome: "challenge_detail",
      latencyMs: 0,
      detail: result.reason,
    });
  }
  return result.ok;
}

function stateFailure(state: string | undefined, requestId: string): Response {
  return fail(state === "completed" ? "already_completed" : "case_state", requestId);
}

function textOfIntake(intake: Intake, answers: { text: string }[] = []): string {
  return [
    intake.title,
    intake.purpose,
    intake.symptoms,
    intake.error,
    ...intake.stack,
    ...intake.working,
    ...answers.map((a) => a.text),
  ].join("\n");
}

type ProviderOutcome = { ok: true; text: string; totalTokens?: number } | { ok: false };

/** Exactly one attempt, bounded by a hard deadline even if the provider ignores the abort signal. */
async function callProvider(
  deps: Deps,
  stage: "triage" | "diagnose",
  messages: ChatMessages,
): Promise<ProviderOutcome> {
  const deadline = deps.providerDeadlineMs ?? LIMITS.providerDeadlineMs;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("deadline"));
    }, deadline);
  });
  try {
    const r = await Promise.race([
      deps.provider.complete({
        stage,
        messages,
        maxOutputTokens: MAX_OUTPUT_TOKENS[stage],
        signal: controller.signal,
      }),
      timeout,
    ]);
    return { ok: true, text: r.text, totalTokens: r.totalTokens };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

function logged(
  deps: Deps,
  stage: LogEvent["stage"],
  requestId: string,
  started: number,
  res: Response,
  extra: Partial<LogEvent> = {},
): Response {
  deps.log({
    requestId,
    stage,
    outcome: outcomes.get(res) ?? "ok",
    latencyMs: deps.now() - started,
    ...extra,
  });
  return res;
}

/* ---------- POST /api/session ---------- */

export async function handleSession(req: Request, deps: Deps): Promise<Response> {
  const requestId = deps.randomId();
  const started = deps.now();
  const res = await sessionFlow(req, deps, requestId);
  return logged(deps, "session", requestId, started, res);
}

async function sessionFlow(req: Request, deps: Deps, requestId: string): Promise<Response> {
  const g = await gate(req, deps, requestId, sessionRequest);
  if (g instanceof Response) return g;
  const { ctx, body } = g;
  const { config, store } = deps;

  if (body.terms.termsVersion !== config.termsVersion || body.terms.privacyVersion !== config.privacyVersion) {
    return fail("consent_required", requestId);
  }
  if (!(await challenge(ctx, body.turnstileToken, "admission"))) return fail("challenge_failed", requestId);

  try {
    // Reuse a valid existing session (its counters keep counting); otherwise issue a new one.
    let sessionHash = parseSessionCookie(
      req.headers.get("cookie"),
      cookieName(config.secureCookies),
      config.secrets.session,
    );
    let newCookie: string | null = null;
    if (sessionHash) {
      const rec = await store.hgetall(keys.session(config.namespace, sessionHash));
      if (!rec || rec.terms !== config.termsVersion || rec.privacy !== config.privacyVersion) sessionHash = null;
    }
    const newSession = sessionHash === null;
    if (!sessionHash) {
      const created = createSessionCookie(config.secrets.session);
      sessionHash = created.sessionHash;
      newCookie = buildSetCookie(
        cookieName(config.secureCookies),
        created.value,
        config.secureCookies,
        LIMITS.sessionTtlSec,
      );
    }

    const caseId = deps.randomId();
    const result = await admitCase(store, {
      ns: config.namespace,
      counters: admitCounters(config.namespace, ctx.ipHash, sessionHash, newSession, deps.now()),
      newSession,
      sessionHash,
      caseId,
      termsVersion: config.termsVersion,
      privacyVersion: config.privacyVersion,
      nowIso: new Date(deps.now()).toISOString(),
    });
    if (!result.ok) {
      return result.reason === "counter" ? denyCounter(result.counter, requestId) : forbid(deps, "session", requestId, "admit_no_session");
    }
    // `cdata` binds later Turnstile widgets to this session. It is a one-way hash, useless without the cookie.
    return respond({ caseId, cdata: sessionHash }, 200, requestId, newCookie ? { "Set-Cookie": newCookie } : {});
  } catch {
    return fail("provider_unavailable", requestId);
  }
}

/* ---------- POST /api/triage ---------- */

export async function handleTriage(req: Request, deps: Deps): Promise<Response> {
  const requestId = deps.randomId();
  const started = deps.now();
  const extra: Partial<LogEvent> = {};
  const res = await triageFlow(req, deps, requestId, extra);
  return logged(deps, "triage", requestId, started, res, extra);
}

async function triageFlow(req: Request, deps: Deps, requestId: string, extra: Partial<LogEvent>): Promise<Response> {
  const g = await gate(req, deps, requestId, triageRequest);
  if (g instanceof Response) return g;
  const { ctx, body } = g;
  const { config, store } = deps;

  const auth = await authSession(req, ctx, "triage");
  if (auth instanceof Response) return auth;
  const { sessionHash } = auth;

  try {
    const rec = await store.hgetall(keys.caseRec(config.namespace, body.caseId));
    if (!rec) return forbid(deps, "triage", requestId, "case_not_found_or_expired");
    if (rec.sessionHash !== sessionHash) return forbid(deps, "triage", requestId, "case_session_mismatch");
    if (rec.state !== "admitted") return stateFailure(rec.state, requestId);
  } catch {
    return fail("provider_unavailable", requestId);
  }

  if (findLikelySecret(textOfIntake(body.intake))) return fail("secret_detected", requestId);
  const evidence = buildEvidenceMap(body.intake);
  const messages = triageMessages(evidence);
  const inputTokens = estimateTokens(messages.system + messages.user);
  if (inputTokens > MAX_INPUT_TOKENS) return fail("too_large", requestId);

  if (!(await challenge(ctx, body.turnstileToken, "triage", sessionHash))) return fail("challenge_failed", requestId);

  const token = deps.randomId();
  try {
    const reserved = await reserveModelCall(store, {
      ns: config.namespace,
      caseId: body.caseId,
      sessionHash,
      from: "admitted",
      to: "triaging",
      counters: reserveCounters(config.namespace, inputTokens + MAX_OUTPUT_TOKENS.triage, ctx.ipHash, sessionHash, config.limits, deps.now()),
      token,
      now: deps.now(),
    });
    if (!reserved.ok) return reserveFailure(reserved, requestId);
  } catch {
    return fail("provider_unavailable", requestId);
  }

  const finish = (to: "triaged" | "failed", fields?: Record<string, string>) =>
    finishModelCall(store, {
      ns: config.namespace,
      caseId: body.caseId,
      sessionHash,
      token,
      from: "triaging",
      to,
      fields,
    }).catch(() => false);

  const out = await callProvider(deps, "triage", messages);
  if (!out.ok) {
    await finish("failed");
    return fail("provider_unavailable", requestId);
  }
  extra.promptVersion = PROMPT_VERSION;
  extra.model = config.groq.model;
  extra.totalTokens = out.totalTokens;

  const interpreted = interpretTriage(out.text);
  if (!interpreted.ok) {
    await finish("failed");
    return fail("invalid_result", requestId);
  }
  const questions = interpreted.value;

  const saved = await finish("triaged", {
    intakeHash: hashOf(body.intake),
    questionsHash: hashOf(questions),
  });
  if (!saved) return fail("case_state", requestId);

  const ticket = signTicket(config.secrets.ticket, {
    v: 1,
    caseId: body.caseId,
    sessionHash,
    intakeHash: hashOf(body.intake),
    questionsHash: hashOf(questions),
    exp: deps.now() + LIMITS.caseTtlSec * 1000,
  });
  return respond({ questions, ticket }, 200, requestId);
}

function reserveFailure(
  r: Exclude<Awaited<ReturnType<typeof reserveModelCall>>, { ok: true }>,
  requestId: string,
): Response {
  if (r.reason === "counter") return denyCounter(r.counter, requestId);
  if (r.reason === "live_disabled") return fail("live_disabled", requestId);
  if (r.reason === "busy_global") return fail("capacity_reached", requestId);
  if (r.reason === "busy_session") return fail("rate_limited", requestId, 5);
  return fail("case_state", requestId);
}

/* ---------- POST /api/diagnose ---------- */

export async function handleDiagnose(req: Request, deps: Deps): Promise<Response> {
  const requestId = deps.randomId();
  const started = deps.now();
  const extra: Partial<LogEvent> = {};
  const res = await diagnoseFlow(req, deps, requestId, extra);
  return logged(deps, "diagnose", requestId, started, res, extra);
}

async function diagnoseFlow(req: Request, deps: Deps, requestId: string, extra: Partial<LogEvent>): Promise<Response> {
  const g = await gate(req, deps, requestId, diagnoseRequest);
  if (g instanceof Response) return g;
  const { ctx, body } = g;
  const { config, store } = deps;

  const auth = await authSession(req, ctx, "diagnose");
  if (auth instanceof Response) return auth;
  const { sessionHash } = auth;

  const ticket = verifyTicket(config.secrets.ticket, body.ticket, deps.now());
  if (!ticket) return forbid(deps, "diagnose", requestId, "ticket_invalid_or_expired");
  if (ticket.caseId !== body.caseId || ticket.sessionHash !== sessionHash) {
    return forbid(deps, "diagnose", requestId, "ticket_case_or_session_mismatch");
  }
  // The browser holds the case; it may not change it between stages.
  if (hashOf(body.intake) !== ticket.intakeHash || hashOf(body.questions) !== ticket.questionsHash) {
    return forbid(deps, "diagnose", requestId, "intake_or_questions_changed");
  }
  const askedIds = new Set(body.questions.map((q) => q.id));
  const answered = new Set<string>();
  for (const a of body.answers) {
    if (!askedIds.has(a.questionId) || answered.has(a.questionId)) return fail("invalid_request", requestId);
    answered.add(a.questionId);
  }

  try {
    const rec = await store.hgetall(keys.caseRec(config.namespace, body.caseId));
    if (!rec) return forbid(deps, "diagnose", requestId, "case_not_found_or_expired");
    if (rec.sessionHash !== sessionHash) return forbid(deps, "diagnose", requestId, "case_session_mismatch");
    if (rec.state !== "triaged") return stateFailure(rec.state, requestId);
    // A valid signature is not enough: Redis state must agree.
    if (rec.intakeHash !== ticket.intakeHash || rec.questionsHash !== ticket.questionsHash) {
      return forbid(deps, "diagnose", requestId, "stored_hashes_differ");
    }
  } catch {
    return fail("provider_unavailable", requestId);
  }

  if (findLikelySecret(textOfIntake(body.intake, body.answers))) return fail("secret_detected", requestId);
  const evidence = buildEvidenceMap(body.intake, body.answers);
  const { messages, inputTokens, references } = prepareDiagnoseInput(evidence, body.questions);
  if (inputTokens > MAX_INPUT_TOKENS) return fail("too_large", requestId);

  if (!(await challenge(ctx, body.turnstileToken, "diagnose", sessionHash))) {
    return fail("challenge_failed", requestId);
  }

  const token = deps.randomId();
  try {
    const reserved = await reserveModelCall(store, {
      ns: config.namespace,
      caseId: body.caseId,
      sessionHash,
      from: "triaged",
      to: "diagnosing",
      counters: reserveCounters(config.namespace, inputTokens + MAX_OUTPUT_TOKENS.diagnose, ctx.ipHash, sessionHash, config.limits, deps.now()),
      token,
      now: deps.now(),
    });
    if (!reserved.ok) return reserveFailure(reserved, requestId);
  } catch {
    return fail("provider_unavailable", requestId);
  }

  const finish = (to: "completed" | "failed") =>
    finishModelCall(store, {
      ns: config.namespace,
      caseId: body.caseId,
      sessionHash,
      token,
      from: "diagnosing",
      to,
    }).catch(() => false);

  const out = await callProvider(deps, "diagnose", messages);
  if (!out.ok) {
    await finish("failed");
    return fail("provider_unavailable", requestId);
  }
  extra.promptVersion = PROMPT_VERSION;
  extra.model = config.groq.model;
  extra.totalTokens = out.totalTokens;

  extra.references = Object.keys(references).length;

  const interpreted = interpretDiagnosis(out.text, evidence, references);
  if (!interpreted.ok) {
    await finish("failed");
    return fail("invalid_result", requestId);
  }
  const { report } = interpreted.value;

  if (!(await finish("completed"))) return fail("case_state", requestId);
  return respond({ report }, 200, requestId);
}

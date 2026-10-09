import RedisMock from "ioredis-mock";
import { Redis } from "@upstash/redis";
import type { ModelProvider, ProviderRequest, ProviderResult } from "@/lib/ai";
import { loadConfig } from "@/lib/config";
import { randomToken } from "@/lib/crypto";
import { upstashStore, type Store } from "@/lib/redis";
import { cookieName, parseSessionCookie } from "@/lib/sessions";
import { sampleCases } from "@/data/sample-cases";
import { intakeSchema } from "@/lib/schemas";
import { handleDiagnose, handleSession, handleTriage, type Deps, type LogEvent } from "@/server/handlers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = Record<string, any>;

export const ORIGIN = "http://localhost:3000";
export const intake = intakeSchema.parse(sampleCases[0].intake);

export function testEnv(over: Record<string, string> = {}): Record<string, string> {
  return {
    REDIS_NAMESPACE: "t",
    LIVE_AI_ENABLED: "true",
    APP_ORIGIN: ORIGIN,
    SESSION_HMAC_SECRET: "s".repeat(43),
    IP_HMAC_SECRET: "i".repeat(43),
    TICKET_HMAC_SECRET: "t".repeat(43),
    GROQ_API_KEY: "gsk-not-real",
    GROQ_MODEL: "test-model",
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "not-real",
    TURNSTILE_SECRET_KEY: "turnstile-secret-not-real",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site-key-not-real",
    TERMS_VERSION: "2026-10-09",
    PRIVACY_VERSION: "2026-10-09",
    ...over,
  };
}

/** The few raw Redis calls the tests make directly. Implemented by ioredis-mock and by Upstash. */
export interface RedisLike {
  hset(key: string, fields: Record<string, string>): Promise<unknown>;
  hget(key: string, field: string): Promise<string | null>;
  zcard(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  ttl(key: string): Promise<number>;
  set(key: string, value: string): Promise<unknown>;
}

export const REAL_REDIS = process.env.REAL_REDIS_TESTS === "1";

function failable(inner: Store) {
  let failing = false;
  const guard = () => {
    if (failing) throw new Error("redis down");
  };
  const store: Store = {
    async eval(script, keys, args) {
      guard();
      return inner.eval(script, keys, args);
    },
    async get(key) {
      guard();
      return inner.get(key);
    },
    async hgetall(key) {
      guard();
      return inner.hgetall(key);
    },
  };
  return { store, setFailing: (v: boolean) => (failing = v) };
}

/** Real Upstash, isolated by a unique namespace that is deleted afterwards. */
export function createRealStore(namespace: string) {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const redis = new Redis({ url, token, automaticDeserialization: false, retry: false });
  const f = failable(upstashStore(url, token));
  return {
    store: f.store,
    redis: redis as unknown as RedisLike,
    setFailing: f.setFailing,
    async reset() {
      const found = await redis.keys(`${namespace}:*`);
      if (found.length) await redis.del(...found);
    },
  };
}

export function createMockStore() {
  const redis = new RedisMock();
  let failing = false;
  const guard = () => {
    if (failing) throw new Error("redis down");
  };
  const store: Store = {
    async eval(script, keys, args) {
      guard();
      return (await redis.eval(script, keys.length, ...keys, ...args)) as unknown[];
    },
    async get(key) {
      guard();
      return redis.get(key);
    },
    async hgetall(key) {
      guard();
      const v = await redis.hgetall(key);
      return Object.keys(v).length ? v : null;
    },
  };
  return {
    store,
    redis: redis as unknown as RedisLike & { flushall(): Promise<unknown> },
    setFailing: (v: boolean) => (failing = v),
    reset: async () => {
      await redis.flushall();
    },
  };
}

/** Fake Siteverify: tokens are single-use, bound to action, hostname and optional cdata. */
export function fakeTurnstile() {
  const used = new Set<string>();
  let n = 0;
  const state = { down: false, calls: 0 };
  const fetchImpl: typeof fetch = async (_url, init) => {
    state.calls++;
    if (state.down) throw new Error("network down");
    const token = (init!.body as URLSearchParams).get("response") ?? "";
    const [, action, hostname, cdata] = token.split("|");
    const valid = token.startsWith("tok-") && !used.has(token);
    used.add(token);
    return Response.json({ success: valid, hostname, action, ...(cdata ? { cdata } : {}) });
  };
  return {
    fetchImpl,
    state,
    issue: (action: string, o: { hostname?: string; cdata?: string } = {}) =>
      `tok-${++n}|${action}|${o.hostname ?? "localhost"}|${o.cdata ?? ""}`,
  };
}

export const TRIAGE_OK = JSON.stringify({
  questions: [{ id: "zz", text: "What does the log show when it fails?", why: "It narrows the cause." }],
});

export function reportJson(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    summary: "Provisional view based on what you reported.",
    assessmentStatus: "provisional",
    observations: [{ text: "Duplicate bookings were reported.", evidenceIds: ["symptoms"] }],
    hypotheses: [
      {
        text: "Availability check and insert may not be atomic.",
        explanation: "Two requests could both pass the check.",
        evidenceIds: ["symptoms", "purpose"],
        confidence: "medium",
        verification: "Reproduce concurrent bookings in staging.",
      },
    ],
    missingInformation: ["Database constraints on bookings."],
    recoveryTasks: [
      {
        title: "Reproduce the double booking",
        priority: "P1",
        rationale: "Confirms the reported behaviour.",
        evidenceIds: ["symptoms"],
        verification: "Submit two overlapping bookings in staging.",
        acceptanceCriteria: ["Exactly one booking is stored."],
      },
    ],
    limitations: ["No code or database was inspected."],
    ...over,
  });
}

export function fakeProvider() {
  const calls: ProviderRequest[] = [];
  const state: { behaviour: (req: ProviderRequest) => Promise<ProviderResult> } = {
    behaviour: async (req) => ({ text: req.stage === "triage" ? TRIAGE_OK : reportJson(), totalTokens: 100 }),
  };
  const provider: ModelProvider = {
    complete(req) {
      calls.push(req);
      return state.behaviour(req);
    },
  };
  return { provider, calls, state };
}

export function makeHarness(envOver: Record<string, string> = {}) {
  const ns = REAL_REDIS ? `hh-test-${randomToken(6)}` : "t";
  const mock = REAL_REDIS ? createRealStore(ns) : createMockStore();
  const ts = fakeTurnstile();
  const prov = fakeProvider();
  const logs: LogEvent[] = [];
  const clock = { ip: "203.0.113.7" as string | null, now: Date.UTC(2026, 9, 9, 12, 0, 0) };
  const config = loadConfig(testEnv({ REDIS_NAMESPACE: ns, ...envOver }));
  const deps: Deps = {
    config,
    store: mock.store,
    provider: prov.provider,
    fetch: ts.fetchImpl,
    now: () => clock.now,
    randomId: () => randomToken(16),
    clientIp: () => clock.ip,
    log: (e) => logs.push(e),
    providerDeadlineMs: 200,
  };

  const cookieKey = cookieName(config.secureCookies);
  const sessionHashOf = (cookie: string) => parseSessionCookie(cookie, cookieKey, config.secrets.session)!;

  function request(
    path: string,
    body: unknown,
    o: { cookie?: string; headers?: Record<string, string>; raw?: BodyInit; duplex?: boolean } = {},
  ): Request {
    return new Request(`${ORIGIN}${path}`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        ...(o.cookie ? { cookie: o.cookie } : {}),
        ...o.headers,
      },
      body: o.raw ?? JSON.stringify(body),
      ...(o.duplex ? { duplex: "half" } : {}),
    } as RequestInit);
  }

  const terms = { accepted: true, termsVersion: config.termsVersion, privacyVersion: config.privacyVersion };

  async function admit(cookie?: string): Promise<{ res: Response; caseId: string; cookie: string }> {
    const res = await handleSession(
      request("/api/session", { turnstileToken: ts.issue("admission"), terms }, { cookie }),
      deps,
    );
    const setCookie = res.headers.get("set-cookie");
    const newCookie = setCookie ? setCookie.split(";")[0] : (cookie ?? "");
    const json = (await res.clone().json()) as { caseId?: string };
    return { res, caseId: json.caseId ?? "", cookie: newCookie };
  }

  async function triage(caseId: string, cookie: string, over: Record<string, unknown> = {}) {
    const res = await handleTriage(
      request(
        "/api/triage",
        { caseId, intake, turnstileToken: ts.issue("triage", { cdata: sessionHashOf(cookie) }), ...over },
        { cookie },
      ),
      deps,
    );
    return { res, json: (await res.clone().json()) as Json };
  }

  async function diagnose(
    caseId: string,
    cookie: string,
    t: { questions: unknown; ticket: string },
    over: Record<string, unknown> = {},
  ) {
    const res = await handleDiagnose(
      request(
        "/api/diagnose",
        {
          caseId,
          intake,
          questions: t.questions,
          answers: [],
          ticket: t.ticket,
          turnstileToken: ts.issue("diagnose", { cdata: sessionHashOf(cookie) }),
          ...over,
        },
        { cookie },
      ),
      deps,
    );
    return { res, json: (await res.clone().json()) as Json };
  }

  /** Admit and triage a case; returns what diagnosis needs. */
  async function triaged(cookie?: string) {
    const a = await admit(cookie);
    const t = await triage(a.caseId, a.cookie);
    return { ...a, questions: t.json.questions, ticket: t.json.ticket as string };
  }

  return {
    mock,
    ns,
    reset: () => mock.reset(),
    ts,
    prov,
    logs,
    clock,
    config,
    deps,
    request,
    terms,
    admit,
    triage,
    diagnose,
    triaged,
    sessionHashOf,
    cookieKey,
  };
}

export type Harness = ReturnType<typeof makeHarness>;

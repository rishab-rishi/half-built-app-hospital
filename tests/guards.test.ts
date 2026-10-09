import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleDiagnose, handleSession, handleTriage } from "@/server/handlers";
import { makeHarness, ORIGIN, intake, type Harness } from "./helpers/harness";

let h: Harness;
afterEach(async () => {
  await h.reset();
});
beforeEach(async () => {
  h = makeHarness();
  await h.reset();
});

const status = (r: Response) => r.status;
async function err(r: Response): Promise<string> {
  return ((await r.clone().json()) as { error: string }).error;
}

describe("live mode and configuration", () => {
  it("is off unless explicitly enabled and fully configured", async () => {
    const off = makeHarness({ LIVE_AI_ENABLED: "false" });
    const res = await handleSession(off.request("/api/session", {}), off.deps);
    expect(status(res)).toBe(503);
    expect(await err(res)).toBe("live_disabled");
    expect(off.prov.calls).toHaveLength(0);
  });

  it("stays off when a security prerequisite is missing", () => {
    const bad = makeHarness({ TICKET_HMAC_SECRET: "replace-locally" });
    expect(bad.config.live).toBe(false);
    expect(bad.config.blockedReasons.join()).toContain("TICKET_HMAC_SECRET");
  });

  it("refuses short, duplicated HMAC secrets and production test keys", () => {
    expect(makeHarness({ IP_HMAC_SECRET: "short" }).config.live).toBe(false);
    expect(makeHarness({ IP_HMAC_SECRET: "s".repeat(43) }).config.live).toBe(false);
    const prod = makeHarness({
      APP_ORIGIN: "https://hospital.example.app",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    });
    expect(prod.config.live).toBe(false);
    expect(prod.config.blockedReasons.join()).toContain("test keys");
  });

  it("refuses to run when the client IP cannot be trusted", async () => {
    h.clock.ip = null;
    const res = await handleSession(h.request("/api/session", {}), h.deps);
    expect(status(res)).toBe(503);
    expect(h.ts.state.calls).toBe(0);
  });

  it("honours the Redis kill-switch", async () => {
    const a = await h.admit();
    await h.mock.redis.set(`${h.ns}:kill`, "1");
    const t = await h.triage(a.caseId, a.cookie);
    expect(t.res.status).toBe(503);
    expect(t.json.error).toBe("live_disabled");
    expect(h.prov.calls).toHaveLength(0);
  });
});

describe("cheap request checks run before anything expensive", () => {
  const cases: [string, Record<string, string>, number][] = [
    ["wrong origin", { origin: "https://evil.example" }, 403],
    ["cross-site fetch metadata", { "sec-fetch-site": "cross-site" }, 403],
    ["non-JSON content type", { "content-type": "text/plain" }, 400],
    ["compressed body", { "content-encoding": "gzip" }, 400],
  ];
  for (const [name, headers, code] of cases) {
    it(`rejects ${name}`, async () => {
      const res = await handleSession(h.request("/api/session", {}, { headers }), h.deps);
      expect(status(res)).toBe(code);
      expect(h.ts.state.calls).toBe(0);
      expect(h.prov.calls).toHaveLength(0);
    });
  }

  it("rejects a missing Origin header", async () => {
    const req = new Request(`${ORIGIN}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(status(await handleSession(req, h.deps))).toBe(403);
  });

  it("rejects invalid JSON and unknown fields", async () => {
    const bad = await handleSession(h.request("/api/session", null, { raw: "{nope" }), h.deps);
    expect(status(bad)).toBe(400);
    const extra = await handleSession(
      h.request("/api/session", { turnstileToken: "x", terms: h.terms, model: "gpt-x" }),
      h.deps,
    );
    expect(status(extra)).toBe(400);
    expect(h.ts.state.calls).toBe(0);
  });

  it("stops reading an oversized chunked body", async () => {
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 8192;
        controller.enqueue(new Uint8Array(8192).fill(97));
        if (sent > 1_000_000) controller.close();
      },
    });
    const req = h.request("/api/session", null, { raw: stream, duplex: true });
    const res = await handleSession(req, h.deps);
    expect(status(res)).toBe(413);
    expect(sent).toBeLessThan(200_000);
    expect(h.ts.state.calls).toBe(0);
  });
});

describe("session, consent and challenge", () => {
  it("rejects stale policy versions", async () => {
    const res = await handleSession(
      h.request("/api/session", {
        turnstileToken: h.ts.issue("admission"),
        terms: { ...h.terms, termsVersion: "1999-01-01" },
      }),
      h.deps,
    );
    expect(status(res)).toBe(403);
    expect(await err(res)).toBe("consent_required");
    expect(h.ts.state.calls).toBe(0);
  });

  it("rejects invalid, replayed, wrong-hostname and wrong-action tokens", async () => {
    const post = (token: string) =>
      handleSession(h.request("/api/session", { turnstileToken: token, terms: h.terms }), h.deps);
    expect(await err(await post("garbage"))).toBe("challenge_failed");
    const good = h.ts.issue("admission");
    expect(status(await post(good))).toBe(200);
    expect(await err(await post(good))).toBe("challenge_failed");
    expect(await err(await post(h.ts.issue("admission", { hostname: "evil.example" })))).toBe("challenge_failed");
    expect(await err(await post(h.ts.issue("triage")))).toBe("challenge_failed");
  });

  it("fails closed when Siteverify is unreachable", async () => {
    h.ts.state.down = true;
    const res = await handleSession(
      h.request("/api/session", { turnstileToken: h.ts.issue("admission"), terms: h.terms }),
      h.deps,
    );
    expect(status(res)).toBe(403);
  });

  it("triage rejects a challenge not bound to the session", async () => {
    const a = await h.admit();
    const t = await h.triage(a.caseId, a.cookie, { turnstileToken: h.ts.issue("triage", { cdata: "other" }) });
    expect(t.res.status).toBe(403);
    expect(h.prov.calls).toHaveLength(0);
  });

  it("calls without a session cookie or with a forged one never reach the model", async () => {
    const a = await h.admit();
    const noCookie = await handleTriage(
      h.request("/api/triage", { caseId: a.caseId, intake, turnstileToken: h.ts.issue("triage") }),
      h.deps,
    );
    expect(status(noCookie)).toBe(403);
    const forged = await handleTriage(
      h.request(
        "/api/triage",
        { caseId: a.caseId, intake, turnstileToken: h.ts.issue("triage") },
        { cookie: `${h.cookieKey}=${"A".repeat(43)}.${"0".repeat(64)}` },
      ),
      h.deps,
    );
    expect(status(forged)).toBe(403);
    expect(h.prov.calls).toHaveLength(0);
  });

  it("direct diagnose without admission or ticket is rejected", async () => {
    const res = await handleDiagnose(
      h.request("/api/diagnose", {
        caseId: "A".repeat(22),
        intake,
        questions: [],
        answers: [],
        ticket: "x.y",
        turnstileToken: h.ts.issue("diagnose"),
      }),
      h.deps,
    );
    expect(status(res)).toBe(403);
    expect(h.prov.calls).toHaveLength(0);
  });

  it("another session cannot use someone else's case", async () => {
    const a = await h.admit();
    h.clock.ip = "203.0.113.99";
    const b = await h.admit();
    const t = await h.triage(a.caseId, b.cookie);
    expect(t.res.status).toBe(403);
    expect(h.prov.calls).toHaveLength(0);
  });
});

describe("two-step assessment integrity", () => {
  it("completes, then refuses replay without another model call", async () => {
    const c = await h.triaged();
    const d = await h.diagnose(c.caseId, c.cookie, c);
    expect(d.res.status).toBe(200);
    expect(d.json.report.recoveryTasks[0].id).toBe("task-1");
    expect(h.prov.calls).toHaveLength(2);
    const again = await h.diagnose(c.caseId, c.cookie, c);
    expect(again.res.status).toBe(409);
    expect(again.json.error).toBe("already_completed");
    const triageAgain = await h.triage(c.caseId, c.cookie);
    expect(triageAgain.res.status).toBe(409);
    expect(h.prov.calls).toHaveLength(2);
  });

  it("normalises question ids on the server", async () => {
    const c = await h.triaged();
    expect(c.questions[0].id).toBe("q1");
  });

  it("rejects bad signatures, edited intake or questions, other sessions, and expired tickets", async () => {
    const c = await h.triaged();
    const flip = c.ticket.slice(0, -1) + (c.ticket.endsWith("0") ? "1" : "0");
    expect((await h.diagnose(c.caseId, c.cookie, { ...c, ticket: flip })).res.status).toBe(403);
    expect(
      (await h.diagnose(c.caseId, c.cookie, c, { intake: { ...intake, symptoms: "different" } })).res.status,
    ).toBe(403);
    expect(
      (await h.diagnose(c.caseId, c.cookie, { ...c, questions: [{ ...c.questions[0], text: "changed" }] })).res.status,
    ).toBe(403);
    h.clock.ip = "203.0.113.50";
    const other = await h.admit();
    expect((await h.diagnose(c.caseId, other.cookie, c)).res.status).toBe(403);
    h.clock.ip = "203.0.113.7";
    h.clock.now += 31 * 60 * 1000;
    expect((await h.diagnose(c.caseId, c.cookie, c)).res.status).toBe(403);
    expect(h.prov.calls).toHaveLength(1);
  });

  it("rejects answers for unknown or duplicated question ids", async () => {
    const c = await h.triaged();
    const unknown = await h.diagnose(c.caseId, c.cookie, c, { answers: [{ questionId: "q3", text: "x" }] });
    expect(unknown.res.status).toBe(400);
    const dup = await h.diagnose(c.caseId, c.cookie, c, {
      answers: [
        { questionId: "q1", text: "a" },
        { questionId: "q1", text: "b" },
      ],
    });
    expect(dup.res.status).toBe(400);
    expect(h.prov.calls).toHaveLength(1);
  });

  it("includes answers as evidence", async () => {
    const c = await h.triaged();
    h.prov.state.behaviour = async () => ({
      text: JSON.stringify({
        ...JSON.parse((await import("./helpers/harness")).reportJson()),
        observations: [{ text: "The log shows a timeout.", evidenceIds: ["answer:q1"] }],
      }),
    });
    const d = await h.diagnose(c.caseId, c.cookie, c, { answers: [{ questionId: "q1", text: "Timeout at step 3" }] });
    expect(d.res.status).toBe(200);
    expect(d.json.report.incomplete).toBe(false);
  });

  it("rejects credential-like text before any challenge or model call", async () => {
    const a = await h.admit();
    const t = await h.triage(a.caseId, a.cookie, {
      intake: { ...intake, error: "key=AKIAABCDEFGHIJKLMNOP leaked" },
    });
    expect(t.res.status).toBe(400);
    expect(t.json.error).toBe("secret_detected");
    expect(h.prov.calls).toHaveLength(0);
  });
});

describe("dependency failure fails closed", () => {
  it("Redis down: no session, no model call", async () => {
    h.mock.setFailing(true);
    const res = await handleSession(
      h.request("/api/session", { turnstileToken: h.ts.issue("admission"), terms: h.terms }),
      h.deps,
    );
    expect(status(res)).toBe(503);
    expect(h.ts.state.calls).toBe(0);
  });

  it("Redis lost mid-flow: the model is never called", async () => {
    const a = await h.admit();
    h.mock.setFailing(true);
    const t = await h.triage(a.caseId, a.cookie);
    expect(t.res.status).toBe(503);
    expect(h.prov.calls).toHaveLength(0);
  });
});

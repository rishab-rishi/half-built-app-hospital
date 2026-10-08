import { beforeEach, describe, expect, it } from "vitest";
import {
  admitCounters,
  attemptCounters,
  finishModelCall,
  keys,
  LIMITS,
  releaseLease,
  reserveCounters,
  reserveModelCall,
  windows,
} from "@/lib/budgets";
import { handleSession } from "@/server/handlers";
import { makeHarness, type Harness, type Json } from "./helpers/harness";

let h: Harness;
beforeEach(async () => {
  h = makeHarness();
  await h.mock.redis.flushall();
});

const calls = (n: number) => expect(h.prov.calls).toHaveLength(n);
async function body(r: Response) {
  return (await r.clone().json()) as Json;
}

describe("parallel requests never overspend", () => {
  it("global budget of one -> at most one model call", async () => {
    h.config.limits.globalPerDay = 1;
    const ips = ["203.0.113.1", "203.0.113.2", "203.0.113.3", "203.0.113.4"];
    const cases = [];
    for (const ip of ips) {
      h.clock.ip = ip;
      cases.push(await h.admit());
    }
    // Slow provider so leases overlap; each request comes from its own IP and session.
    h.prov.state.behaviour = async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { text: JSON.stringify({ questions: [] }) };
    };
    const results = await Promise.all(
      cases.map(async (c, i) => {
        h.clock.ip = ips[i];
        return h.triage(c.caseId, c.cookie);
      }),
    );
    calls(1);
    expect(results.filter((r) => r.res.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.json.error === "capacity_reached").length).toBe(3);
  });

  it("duplicate simultaneous triage -> one model call", async () => {
    const a = await h.admit();
    h.prov.state.behaviour = async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { text: JSON.stringify({ questions: [] }) };
    };
    const results = await Promise.all([1, 2, 3].map(() => h.triage(a.caseId, a.cookie)));
    calls(1);
    expect(results.filter((r) => r.res.status === 200)).toHaveLength(1);
  });

  it("duplicate simultaneous diagnosis -> one model call", async () => {
    const c = await h.triaged();
    calls(1);
    h.prov.state.behaviour = async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { text: (await import("./helpers/harness")).reportJson() };
    };
    const results = await Promise.all([1, 2, 3].map(() => h.diagnose(c.caseId, c.cookie, c)));
    calls(2);
    expect(results.filter((r) => r.res.status === 200)).toHaveLength(1);
  });

  it("global token budget blocks inference even when call counts allow it", async () => {
    h.config.limits.globalTokensPerDay = LIMITS.reserveTokens.triage - 1;
    const a = await h.admit();
    const t = await h.triage(a.caseId, a.cookie);
    expect(t.json.error).toBe("capacity_reached");
    calls(0);
  });

  it("global exhaustion blocks every new inference", async () => {
    h.config.limits.globalPerDay = 1;
    const first = await h.triaged();
    expect(first.ticket).toBeTruthy();
    const d = await h.diagnose(first.caseId, first.cookie, first);
    expect(d.json.error).toBe("capacity_reached");
    h.clock.ip = "203.0.113.200";
    const other = await h.admit();
    const t = await h.triage(other.caseId, other.cookie);
    expect(t.json.error).toBe("capacity_reached");
    calls(1);
  });
});

describe("shared limits", () => {
  it("per-IP attempt limit returns 429 with Retry-After", async () => {
    let last: Response | undefined;
    for (let i = 0; i < LIMITS.attemptsPerMinuteIp + 1; i++) {
      last = await handleSession(h.request("/api/session", {}), h.deps);
    }
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("resetting cookies cannot bypass the per-IP case quota", async () => {
    const results = [];
    for (let i = 0; i < LIMITS.casesPerDay + 1; i++) results.push(await h.admit()); // no cookie reuse
    expect(results.slice(0, LIMITS.casesPerDay).every((r) => r.res.status === 200)).toBe(true);
    expect(results[LIMITS.casesPerDay].res.status).toBe(429);
  });

  it("reusing a session does not reset its counters", async () => {
    const a = await h.admit();
    const b = await h.admit(a.cookie);
    expect(b.res.status).toBe(200);
    expect(b.res.headers.get("set-cookie")).toBeNull();
    const c = await h.admit(a.cookie);
    expect(c.res.status).toBe(429);
  });

  it("windows use UTC calendar buckets with a real reset time", () => {
    const w = windows(Date.UTC(2026, 11, 31, 23, 59, 30));
    expect(w.day).toBe("20261231");
    expect(w.month).toBe("202612");
    expect(w.toMinute).toBe(30);
    expect(w.toDay).toBe(30);
    expect(w.toMonth).toBe(30);
  });

  it("counter keys expire after their bucket plus grace", async () => {
    await h.admit();
    const w = windows(h.clock.now);
    const ipKeys = (await h.mock.redis.keys("t:c:case-d:*")) as string[];
    expect(ipKeys.length).toBeGreaterThan(0);
    const ttl = await h.mock.redis.ttl(ipKeys[0]);
    expect(ttl).toBeGreaterThan(w.toDay);
    expect(ttl).toBeLessThanOrEqual(w.toDay + 3600);
  });
});

describe("leases are ownership-safe and expire", () => {
  const ns = "t";
  async function seedCase(id: string, session: string, state = "triaged") {
    await h.mock.redis.hset(keys.caseRec(ns, id), { state, sessionHash: session });
  }
  const reserve = (id: string, session: string, token: string, now = 1_000_000) =>
    reserveModelCall(h.deps.store, {
      ns,
      caseId: id,
      sessionHash: session,
      from: "triaged",
      to: "diagnosing",
      counters: reserveCounters(ns, "diagnose", "ip-" + id, session, h.config.limits, now),
      token,
      now,
    });

  it("one request cannot release another's lease", async () => {
    await seedCase("c1", "s1");
    await seedCase("c2", "s1");
    expect((await reserve("c1", "s1", "A")).ok).toBe(true);
    const busy = await reserve("c2", "s1", "B");
    expect(busy).toEqual({ ok: false, reason: "busy_session" });
    await releaseLease(h.deps.store, { ns, sessionHash: "s1", token: "B" }); // wrong owner
    expect(await h.mock.redis.zcard(keys.globalLease(ns))).toBe(1);
    expect(await h.mock.redis.zcard(keys.sessionLease(ns, "s1"))).toBe(1);
    expect(await reserve("c2", "s1", "C")).toEqual({ ok: false, reason: "busy_session" });
    await releaseLease(h.deps.store, { ns, sessionHash: "s1", token: "A" });
    expect((await reserve("c2", "s1", "D")).ok).toBe(true);
  });

  it("reserve itself enforces the case state, session binding and kill-switch (not just the handler)", async () => {
    await seedCase("k", "s-k", "admitted");
    expect(await reserve("k", "s-k", "T")).toEqual({ ok: false, reason: "case_state" }); // wrong state
    await seedCase("k2", "s-real");
    expect(await reserve("k2", "s-other", "T")).toEqual({ ok: false, reason: "case_state" }); // wrong session
    await seedCase("k3", "s-k3");
    await h.mock.redis.set(keys.kill(ns), "1");
    expect(await reserve("k3", "s-k3", "T")).toEqual({ ok: false, reason: "live_disabled" });
    expect(await h.mock.redis.zcard(keys.globalLease(ns))).toBe(0);
  });

  it("global concurrency is capped and a crashed lease expires", async () => {
    for (const [id, s] of [["a", "s-a"], ["b", "s-b"], ["c", "s-c"]]) await seedCase(id, s);
    expect((await reserve("a", "s-a", "1")).ok).toBe(true);
    expect((await reserve("b", "s-b", "2")).ok).toBe(true);
    expect(await reserve("c", "s-c", "3")).toEqual({ ok: false, reason: "busy_global" });
    const later = 1_000_000 + LIMITS.leaseMs + 1;
    expect((await reserve("c", "s-c", "3", later)).ok).toBe(true);
  });

  it("reservation is all-or-nothing: a denied budget leaves earlier counters untouched", async () => {
    await seedCase("x", "s-x");
    h.config.limits.globalPerMonth = 0;
    const denied = await reserve("x", "s-x", "T");
    expect(denied.ok).toBe(false);
    expect(await h.mock.redis.keys("t:c:ai-m:ip-x:*")).toEqual([]);
    expect(await h.mock.redis.hget(keys.caseRec(ns, "x"), "state")).toBe("triaged");
  });

  it("finish transitions state only from the expected state", async () => {
    await seedCase("f", "s-f", "diagnosing");
    expect(
      await finishModelCall(h.deps.store, {
        ns,
        caseId: "f",
        sessionHash: "s-f",
        token: "t",
        from: "triaging",
        to: "triaged",
      }),
    ).toBe(false);
    expect(await h.mock.redis.hget(keys.caseRec(ns, "f"), "state")).toBe("diagnosing");
  });

  it("helper counters are shaped as expected", () => {
    expect(attemptCounters(ns, "ip", 0)).toHaveLength(2);
    expect(admitCounters(ns, "ip", "s", true, 0)).toHaveLength(3);
    expect(admitCounters(ns, "ip", "s", false, 0)).toHaveLength(2);
    expect(reserveCounters(ns, "triage", "ip", "s", h.config.limits, 0).map((c) => c.scope)).toEqual([
      "ip", "ip", "session", "session", "global", "global", "global", "global", "global",
    ]);
  });
});

describe("provider failures cause no hidden retry", () => {
  const scenarios: [string, (h: Harness) => void, string][] = [
    ["provider error (e.g. 429)", (x) => (x.prov.state.behaviour = async () => { throw new Error("429"); }), "provider_unavailable"],
    ["timeout", (x) => (x.prov.state.behaviour = () => new Promise(() => undefined)), "provider_unavailable"],
    ["malformed JSON", (x) => (x.prov.state.behaviour = async () => ({ text: "not json" })), "invalid_result"],
    ["schema violation", (x) => (x.prov.state.behaviour = async () => ({ text: '{"questions":"nope"}' })), "invalid_result"],
    [
      "unsafe content",
      (x) =>
        (x.prov.state.behaviour = async () => ({
          text: JSON.stringify({ questions: [{ text: "Please paste your API key here.", why: "to check" }] }),
        })),
      "invalid_result",
    ],
  ];
  for (const [name, setup, expected] of scenarios) {
    it(`${name}: exactly one attempt, case consumed`, async () => {
      const a = await h.admit();
      setup(h);
      const t = await h.triage(a.caseId, a.cookie);
      expect(t.json.error).toBe(expected);
      calls(1);
      const retry = await h.triage(a.caseId, a.cookie);
      expect(retry.res.status).toBe(409);
      calls(1);
    });
  }

  it("diagnosis failure also consumes the stage", async () => {
    const c = await h.triaged();
    h.prov.state.behaviour = async () => ({ text: "garbage" });
    const d = await h.diagnose(c.caseId, c.cookie, c);
    expect(d.json.error).toBe("invalid_result");
    const again = await h.diagnose(c.caseId, c.cookie, c);
    expect(again.res.status).toBe(409);
    calls(2);
  });

  it("invented evidence ids are removed and the report is marked incomplete", async () => {
    const c = await h.triaged();
    const { reportJson } = await import("./helpers/harness");
    h.prov.state.behaviour = async () => ({
      text: reportJson({ observations: [{ text: "Made up.", evidenceIds: ["error:L99", "symptoms"] }] }),
    });
    const d = await h.diagnose(c.caseId, c.cookie, c);
    expect(d.res.status).toBe(200);
    expect(d.json.report.incomplete).toBe(true);
    expect(d.json.report.observations[0].evidenceIds).toEqual(["symptoms"]);
  });
});

describe("logging", () => {
  it("records only allowlisted fields, never content, cookies, IPs, tickets or tokens", async () => {
    const c = await h.triaged();
    await h.diagnose(c.caseId, c.cookie, c);
    const dump = JSON.stringify(h.logs);
    expect(h.logs.length).toBe(3);
    for (const forbidden of [c.cookie.split("=")[1], c.ticket, "203.0.113.7", "Double", "tok-"]) {
      expect(dump).not.toContain(forbidden);
    }
    expect(Object.keys(h.logs[1]).sort()).toEqual(["latencyMs", "outcome", "promptVersion", "requestId", "stage", "totalTokens"]);
  });
});

describe("responses", () => {
  it("are never cacheable and expose no internals", async () => {
    const a = await h.admit();
    expect(a.res.headers.get("cache-control")).toBe("no-store");
    h.mock.setFailing(true);
    const t = await h.triage(a.caseId, a.cookie);
    expect(JSON.stringify(await body(t.res))).not.toMatch(/redis|stack|ECONN|groq/i);
  });

  it("session cookie is HttpOnly, SameSite=Strict, path-wide, no Domain", async () => {
    const a = await h.admit();
    const cookie = a.res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=86400/);
    expect(cookie).not.toMatch(/Domain/i);
  });
});

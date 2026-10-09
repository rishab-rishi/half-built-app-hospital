import { describe, expect, it } from "vitest";
import { describeFailure, postJson } from "@/lib/api-client";

const reply = (status: number, body: unknown, headers: Record<string, string> = {}): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status, headers })) as typeof fetch;

describe("postJson", () => {
  it("returns data on success", async () => {
    const r = await postJson<{ caseId: string }>("/api/session", {}, reply(200, { caseId: "x" }));
    expect(r).toEqual({ ok: true, data: { caseId: "x" } });
  });

  it("maps only allowlisted categories and carries Retry-After", async () => {
    const r = await postJson("/api/triage", {}, reply(429, { error: "rate_limited", requestId: "r1" }, { "retry-after": "42" }));
    expect(r).toEqual({ ok: false, category: "rate_limited", retryAfterSec: 42, requestId: "r1" });
    const unknown = await postJson("/api/triage", {}, reply(500, { error: "redis exploded: ECONNREFUSED" }));
    expect(unknown).toMatchObject({ ok: false, category: "unknown" });
    expect(JSON.stringify(unknown)).not.toContain("redis");
  });

  it("reports network failure and non-JSON replies without throwing", async () => {
    const down = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await postJson("/api/session", {}, down)).toMatchObject({ category: "network" });
    const html = (async () => new Response("<html>", { status: 502 })) as typeof fetch;
    expect(await postJson("/api/session", {}, html)).toMatchObject({ category: "unknown" });
  });

  it("makes exactly one request per call", async () => {
    let n = 0;
    const f = (async () => {
      n++;
      return new Response("{}", { status: 503 });
    }) as typeof fetch;
    await postJson("/api/diagnose", {}, f);
    expect(n).toBe(1);
  });
});

describe("describeFailure", () => {
  it("shows a wait time for short rate limits and offers samples for service-wide problems", () => {
    const v = describeFailure({ ok: false, category: "rate_limited", retryAfterSec: 30 });
    expect(v.message).toContain("30 seconds");
    expect(v.canRetry).toBe(true);
    expect(describeFailure({ ok: false, category: "capacity_reached" }).offerSample).toBe(true);
    expect(describeFailure({ ok: false, category: "live_disabled" }).canRetry).toBe(false);
  });

  it("tells apart a site-wide per-minute cap from a spent daily allowance, and states the UTC reset", () => {
    const short = describeFailure({ ok: false, category: "capacity_reached", retryAfterSec: 40 });
    expect(short.message).toContain("40 seconds");
    expect(short.message).not.toMatch(/used up/);
    expect(short.canRetry).toBe(true);
    const daily = describeFailure({ ok: false, category: "capacity_reached" });
    expect(daily.message).toContain("00:00 UTC");
    expect(daily.canRetry).toBe(false);
  });

  it("never offers a retry once a stage is consumed", () => {
    expect(describeFailure({ ok: false, category: "invalid_result" }).canRetry).toBe(false);
    expect(describeFailure({ ok: false, category: "case_state" }).canRetry).toBe(false);
  });

  it("covers unknown categories with generic copy", () => {
    expect(describeFailure({ ok: false, category: "unknown" }).message).toMatch(/went wrong/);
  });
});

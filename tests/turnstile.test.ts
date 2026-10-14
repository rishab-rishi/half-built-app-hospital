import { describe, expect, it } from "vitest";
import { checkTurnstile, verifyTurnstile } from "@/lib/turnstile";
import { handleSession } from "@/server/handlers";
import { makeHarness } from "./helpers/harness";

const base = { token: "tok-SECRET-VALUE", secret: "sec-SECRET-VALUE", action: "triage" as const, hostname: "app.example", cdata: "abc" };
const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("checkTurnstile reasons", () => {
  it("passes only when success, hostname, action and cdata all match", async () => {
    const ok = { success: true, hostname: "app.example", action: "triage", cdata: "abc" };
    expect(await checkTurnstile({ ...base, fetchImpl: reply(ok) })).toEqual({ ok: true });
    expect(await verifyTurnstile({ ...base, fetchImpl: reply(ok) })).toBe(true);
  });

  it("names the comparison that failed", async () => {
    const ok = { success: true, hostname: "app.example", action: "triage", cdata: "abc" };
    const reason = async (over: object, fetchImpl = reply({ ...ok, ...over })) =>
      (await checkTurnstile({ ...base, fetchImpl })) as { ok: false; reason: string };
    expect((await reason({ hostname: "other.example" })).reason).toBe("hostname_mismatch:other.example");
    expect((await reason({ action: "admission" })).reason).toBe("action_mismatch:admission");
    expect((await reason({ cdata: "zzz" })).reason).toBe("cdata_mismatch");
    expect((await reason({ cdata: undefined })).reason).toBe("cdata_missing");
    // What the real Siteverify answers when the widget was rendered without a cData option.
    expect((await reason({ cdata: "" })).reason).toBe("cdata_missing");
    expect((await reason({ success: false, "error-codes": ["timeout-or-duplicate"] })).reason).toBe("rejected:timeout-or-duplicate");
    expect((await reason({}, reply({}, 500))).reason).toBe("http_500");
    expect((await reason({}, (async () => { throw new Error("boom"); }) as unknown as typeof fetch)).reason).toBe("error");
    expect((await checkTurnstile({ ...base, token: "" })).ok).toBe(false);
  });

  it("never lets unexpected response text into the reason", async () => {
    const r = (await checkTurnstile({
      ...base,
      fetchImpl: reply({ success: false, "error-codes": ["<script>alert(1)</script> with spaces"] }),
    })) as { ok: false; reason: string };
    expect(r.reason).toBe("rejected:?");
  });

  it("times out as 'timeout'", async () => {
    const slow = ((_: unknown, init: RequestInit) =>
      new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("x"), { name: "AbortError" }))))) as unknown as typeof fetch;
    const r = (await checkTurnstile({ ...base, timeoutMs: 10, fetchImpl: slow })) as { ok: false; reason: string };
    expect(r.reason).toBe("timeout");
  });
});

describe("handler logging of a failed challenge", () => {
  it("logs the reason and the stage, but no token or secret, and the visitor sees only the generic failure", async () => {
    const h = makeHarness();
    // The fake Siteverify refuses any token it did not issue.
    const res = await handleSession(h.request("/api/session", { turnstileToken: "forged-SECRET-VALUE", terms: h.terms }), h.deps);
    expect((await res.json()).error).toBe("challenge_failed");
    const detail = h.logs.find((l) => l.outcome === "challenge_detail");
    expect(detail?.stage).toBe("session");
    expect(detail?.detail).toBe("rejected:none");
    expect(JSON.stringify(h.logs)).not.toMatch(/forged-SECRET-VALUE|sec-SECRET/);
  });
});

describe("handler logging of a refused (403) request", () => {
  const reasons = (h: ReturnType<typeof makeHarness>) =>
    h.logs.filter((l) => l.outcome === "forbidden_detail").map((l) => `${l.stage}:${l.detail}`);

  it("says which check refused a triage request, without changing the visitor's answer", async () => {
    const h = makeHarness();
    const a = await h.admit();

    const noCookie = await h.triage(a.caseId, "");
    expect(noCookie.json.error).toBe("forbidden");

    const unknownCase = await h.triage("A".repeat(22), a.cookie);
    expect(unknownCase.json.error).toBe("forbidden");

    const other = await h.admit(); // a second session
    h.clock.ip = "203.0.113.55";
    const stranger = await h.admit();
    const crossed = await h.triage(a.caseId, stranger.cookie); // someone else's case id
    expect(crossed.json.error).toBe("forbidden");
    void other;

    expect(reasons(h)).toEqual([
      "triage:no_session_cookie",
      "triage:case_not_found_or_expired",
      "triage:case_session_mismatch",
    ]);
    expect(JSON.stringify(h.logs)).not.toContain(a.cookie);
  });
});

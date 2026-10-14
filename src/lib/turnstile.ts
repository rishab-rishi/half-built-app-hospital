import "server-only";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileExpect = {
  token: string;
  secret: string;
  action: "admission" | "triage" | "diagnose";
  hostname: string;
  /** Session binding for post-admission stages. */
  cdata?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type TurnstileResult = { ok: true } | { ok: false; reason: string };

// Only short, fixed-vocabulary strings ever reach the logs: never a token, secret, or arbitrary response text.
const safe = (v: unknown, max = 40): string => (typeof v === "string" && /^[A-Za-z0-9._:-]{0,100}$/.test(v) ? v.slice(0, max) : "?");

/**
 * Fails closed: any error, timeout, or mismatch means the challenge did not pass. The reason says which check
 * failed, so a deployment problem can be diagnosed from the logs. Tokens are never logged.
 */
export async function checkTurnstile(e: TurnstileExpect): Promise<TurnstileResult> {
  if (!e.token || e.token.length > 2048) return { ok: false, reason: "bad_token" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), e.timeoutMs ?? 4000);
  try {
    const res = await (e.fetchImpl ?? fetch)(SITEVERIFY, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: e.secret, response: e.token }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const data = (await res.json()) as {
      success?: boolean;
      hostname?: string;
      action?: string;
      cdata?: string;
      "error-codes"?: unknown;
    };
    if (data.success !== true) {
      const codes = Array.isArray(data["error-codes"]) ? data["error-codes"].slice(0, 3).map((c) => safe(c)).join(",") : "";
      return { ok: false, reason: `rejected:${codes || "none"}` };
    }
    if (data.hostname !== e.hostname) return { ok: false, reason: `hostname_mismatch:${safe(data.hostname, 80)}` };
    if (data.action !== e.action) return { ok: false, reason: `action_mismatch:${safe(data.action)}` };
    if (e.cdata !== undefined && data.cdata !== e.cdata) {
      return { ok: false, reason: data.cdata === undefined ? "cdata_missing" : "cdata_mismatch" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err as Error)?.name === "AbortError" ? "timeout" : "error" };
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyTurnstile(e: TurnstileExpect): Promise<boolean> {
  return (await checkTurnstile(e)).ok;
}

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

/** Fails closed: any error, timeout, or mismatch means the challenge did not pass. Tokens are never logged. */
export async function verifyTurnstile(e: TurnstileExpect): Promise<boolean> {
  if (!e.token || e.token.length > 2048) return false;
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
    if (!res.ok) return false;
    const data = (await res.json()) as {
      success?: boolean;
      hostname?: string;
      action?: string;
      cdata?: string;
    };
    if (data.success !== true) return false;
    if (data.hostname !== e.hostname) return false;
    if (data.action !== e.action) return false;
    if (e.cdata !== undefined && data.cdata !== e.cdata) return false;
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

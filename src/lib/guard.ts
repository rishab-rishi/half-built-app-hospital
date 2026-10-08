export const MAX_BODY_BYTES = 32 * 1024;

export type GuardFailure = "forbidden" | "invalid_request" | "too_large";

/** Stateless header checks. Run before any state is touched. */
export function checkHeaders(req: Request, allowedOrigin: string): GuardFailure | null {
  if (req.method !== "POST") return "invalid_request";
  // Exact allowlist from configuration; a missing Origin is rejected (browser-only endpoints).
  const origin = req.headers.get("origin");
  if (!origin || origin !== allowedOrigin) return "forbidden";
  if (req.headers.get("sec-fetch-site") === "cross-site") return "forbidden";
  const type = req.headers.get("content-type") ?? "";
  if (!/^application\/json\s*(;.*)?$/i.test(type)) return "invalid_request";
  const encoding = (req.headers.get("content-encoding") ?? "identity").trim().toLowerCase();
  if (encoding !== "identity") return "invalid_request";
  return null;
}

export type BodyResult = { ok: true; value: unknown } | { ok: false; failure: GuardFailure };

/** Reads the real stream and stops at the cap; Content-Length alone is never trusted. */
export async function readJsonBody(req: Request, maxBytes = MAX_BODY_BYTES): Promise<BodyResult> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, failure: "too_large" };
  if (!req.body) return { ok: false, failure: "invalid_request" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, failure: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, failure: "invalid_request" };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, failure: "invalid_request" };
  }
}

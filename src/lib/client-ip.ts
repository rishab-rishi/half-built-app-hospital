import { isIP } from "node:net";

/** Canonical form so one client cannot appear as several limiter keys. */
export function normaliseIp(raw: string): string | null {
  const v = raw.trim();
  const kind = isIP(v);
  if (kind === 4) return v;
  if (kind === 6) {
    try {
      // URL parsing canonicalises IPv6 text (case, zero compression).
      const host = new URL(`http://[${v}]`).hostname.slice(1, -1);
      // IPv4-mapped addresses come back from URL parsing in hex form (::ffff:102:304).
      const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host);
      if (mapped) {
        const hi = parseInt(mapped[1], 16);
        const lo = parseInt(mapped[2], 16);
        return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
      }
      return host;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Trusted client IP. Only a platform-set header is read, and only when the platform is known
 * to overwrite it. Anywhere else this returns null, so live inference is refused rather than
 * skipping IP limits. Re-verify on the deployed environment before enabling live mode.
 */
export function trustedClientIp(headers: Headers, env: Record<string, string | undefined>): string | null {
  if (env.VERCEL !== "1") return null;
  const value = headers.get("x-real-ip");
  if (!value || value.includes(",")) return null;
  return normaliseIp(value);
}

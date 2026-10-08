import { hmacHex, randomToken, safeEqual } from "./crypto";

const ID_RE = /^[A-Za-z0-9_-]{43}$/;

/** Production uses the __Host- prefix (Secure, Path=/, no Domain). Plain-HTTP localhost needs a different name. */
export function cookieName(secure: boolean): string {
  return secure ? "__Host-hospital-session" : "hospital-session-dev";
}

export function sessionHashOf(secret: string, id: string): string {
  return hmacHex(secret, "session-id", id);
}

export function createSessionCookie(secret: string): { value: string; sessionHash: string } {
  const id = randomToken(32);
  return { value: `${id}.${hmacHex(secret, "session-cookie", id)}`, sessionHash: sessionHashOf(secret, id) };
}

/** Returns the session hash only if the cookie's signature is valid. Redis still decides if it exists. */
export function parseSessionCookie(header: string | null, name: string, secret: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    const dot = value.indexOf(".");
    if (dot < 0) return null;
    const id = value.slice(0, dot);
    const sig = value.slice(dot + 1);
    if (!ID_RE.test(id)) return null;
    return safeEqual(sig, hmacHex(secret, "session-cookie", id)) ? sessionHashOf(secret, id) : null;
  }
  return null;
}

export function buildSetCookie(name: string, value: string, secure: boolean, maxAgeSec: number): string {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAgeSec}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

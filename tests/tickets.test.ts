import { describe, expect, it } from "vitest";
import { canonicalJson, hashOf, safeEqual } from "@/lib/crypto";
import { normaliseIp, trustedClientIp } from "@/lib/client-ip";
import { findUnsafeOutput } from "@/lib/output-checks";
import { findLikelySecret } from "@/lib/secrets";
import { buildSetCookie, cookieName, createSessionCookie, parseSessionCookie } from "@/lib/sessions";
import { signTicket, verifyTicket, type TicketPayload } from "@/lib/tickets";
import { estimateTokens } from "@/lib/tokens";

const SECRET = "k".repeat(43);
const h64 = (c: string) => c.repeat(64);
const payload: TicketPayload = {
  v: 1,
  caseId: "c".repeat(22),
  sessionHash: h64("a"),
  intakeHash: h64("b"),
  questionsHash: h64("c"),
  exp: 2_000_000,
};

describe("tickets", () => {
  it("round-trips and contains no case text", () => {
    const t = signTicket(SECRET, payload);
    expect(verifyTicket(SECRET, t, 1_000_000)).toEqual(payload);
    const body = Buffer.from(t.split(".")[0], "base64url").toString();
    expect(Object.keys(JSON.parse(body)).sort()).toEqual(["caseId", "exp", "intakeHash", "questionsHash", "sessionHash", "v"]);
  });

  it("rejects wrong secret, tampering, expiry, and malformed input", () => {
    const t = signTicket(SECRET, payload);
    expect(verifyTicket("z".repeat(43), t, 1)).toBeNull();
    expect(verifyTicket(SECRET, t, 2_000_000)).toBeNull();
    const forged = Buffer.from(JSON.stringify({ ...payload, exp: 9_999_999 })).toString("base64url");
    expect(verifyTicket(SECRET, `${forged}.${t.split(".")[1]}`, 1)).toBeNull();
    for (const bad of ["", "x", "a.b", ".", `${t}.extra`, "x".repeat(2000)]) {
      expect(verifyTicket(SECRET, bad, 1)).toBeNull();
    }
  });
});

describe("sessions", () => {
  it("accepts only cookies with a valid signature", () => {
    const c = createSessionCookie(SECRET);
    const name = cookieName(false);
    expect(parseSessionCookie(`a=b; ${name}=${c.value}; c=d`, name, SECRET)).toBe(c.sessionHash);
    expect(parseSessionCookie(`${name}=${c.value}`, name, "z".repeat(43))).toBeNull();
    expect(parseSessionCookie(`${name}=${c.value}x`, name, SECRET)).toBeNull();
    expect(parseSessionCookie(null, name, SECRET)).toBeNull();
    expect(parseSessionCookie(`other=${c.value}`, name, SECRET)).toBeNull();
  });

  it("uses the __Host- prefix and Secure in production", () => {
    expect(cookieName(true)).toBe("__Host-hospital-session");
    const c = buildSetCookie(cookieName(true), "v", true, 86400);
    expect(c).toContain("Secure");
    expect(c).toContain("Path=/");
    expect(c).not.toContain("Domain");
  });
});

describe("client IP", () => {
  it("ignores spoofable headers and off-platform requests", () => {
    const spoof = new Headers({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" });
    expect(trustedClientIp(spoof, {})).toBeNull();
    expect(trustedClientIp(spoof, { NODE_ENV: "production" })).toBeNull(); // no dev identity in built apps
    expect(trustedClientIp(spoof, { NODE_ENV: "test" })).toBeNull();
    expect(trustedClientIp(spoof, { NODE_ENV: "development" })).toBe("127.0.0.1"); // never reads spoofable headers
    expect(trustedClientIp(spoof, { NODE_ENV: "development", VERCEL: "1" })).toBe("5.6.7.8");
    expect(trustedClientIp(spoof, { VERCEL: "1" })).toBe("5.6.7.8");
    expect(trustedClientIp(new Headers({ "x-real-ip": "1.1.1.1, 2.2.2.2" }), { VERCEL: "1" })).toBeNull();
    expect(trustedClientIp(new Headers({ "x-real-ip": "not-an-ip" }), { VERCEL: "1" })).toBeNull();
    expect(trustedClientIp(new Headers(), { VERCEL: "1" })).toBeNull();
  });

  it("normalises equivalent addresses to one key", () => {
    expect(normaliseIp("2001:DB8:0:0:0:0:0:1")).toBe(normaliseIp("2001:db8::1"));
    expect(normaliseIp("::ffff:1.2.3.4")).toBe("1.2.3.4");
    expect(normaliseIp("999.1.1.1")).toBeNull();
  });
});

describe("credential detection", () => {
  const hits = [
    "-----BEGIN RSA PRIVATE KEY-----",
    "AKIAABCDEFGHIJKLMNOP",
    "ghp_" + "a".repeat(36),
    "sk_live_" + "a".repeat(24),
    "gsk_" + "a".repeat(30),
    "postgres://admin:hunter22@db.internal/app",
    "password = SuperSecret12345",
    "Authorization: Bearer " + "a".repeat(30),
    "eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.abcdefghijkl",
  ];
  for (const t of hits) it(`flags: ${t.slice(0, 24)}`, () => expect(findLikelySecret(t)).not.toBeNull());

  it("leaves ordinary bug reports alone and never returns the secret itself", () => {
    expect(findLikelySecret("Users see a password reset page after login fails with 500")).toBeNull();
    expect(findLikelySecret("TypeError: cannot read properties of undefined (reading 'id')")).toBeNull();
    // Ordinary configuration code is not a credential and must not block a visitor.
    expect(findLikelySecret("password: process.env.DB_PASSWORD")).toBeNull();
    expect(findLikelySecret("secret: config.secrets.turnstile,")).toBeNull();
    expect(findLikelySecret("api_key = get_settings().api_key_value")).toBeNull();
    expect(findLikelySecret("AKIAABCDEFGHIJKLMNOP")).toBe("AWS access key");
  });
});

describe("output checks", () => {
  const bad = [
    "Please paste your API key so I can check.",
    "We scanned your repository and found nothing.",
    "This is safe to deploy.",
    "Run rm -rf node_modules and retry",
    "Then disable authentication temporarily.",
    "See https://example.com/fix",
    "<img src=x onerror=alert(1)>",
  ];
  for (const t of bad) it(`rejects: ${t.slice(0, 30)}`, () => expect(findUnsafeOutput({ a: [t] })).not.toBeNull());

  it("allows ordinary cautious advice", () => {
    expect(
      findUnsafeOutput({
        a: "Send a redacted webhook payload with tokens removed. Test in staging first and keep a backup.",
        b: ["Reproduce the booking race with two concurrent requests."],
      }),
    ).toBeNull();
  });
});

describe("crypto helpers", () => {
  it("canonical JSON is key-order independent", () => {
    expect(hashOf({ a: 1, b: { c: [1, 2], d: "x" } })).toBe(hashOf({ b: { d: "x", c: [1, 2] }, a: 1 }));
    expect(hashOf({ a: 1 })).not.toBe(hashOf({ a: 2 }));
    expect(canonicalJson({ b: undefined, a: 1 })).toBe('{"a":1}');
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("token estimate is conservative and counts bytes, not characters", () => {
    expect(estimateTokens("a".repeat(300))).toBeGreaterThanOrEqual(100);
    expect(estimateTokens("日本語".repeat(100))).toBeGreaterThan(estimateTokens("abc".repeat(100)));
  });
});

import { toRecord } from "@/lib/redis";

describe("Upstash hash reply normalisation", () => {
  it("turns the flat array form into a record", () => {
    expect(toRecord(["terms", "2026-10-09", "n", "123"])).toEqual({ terms: "2026-10-09", n: "123" });
  });
  it("treats missing or empty replies as no key", () => {
    expect(toRecord(null)).toBeNull();
    expect(toRecord([])).toBeNull();
    expect(toRecord({})).toBeNull();
  });
  it("accepts an object reply and stringifies values", () => {
    expect(toRecord({ n: 123 })).toEqual({ n: "123" });
  });
  it("rejects malformed replies instead of guessing", () => {
    expect(() => toRecord(["a"])).toThrow();
    expect(() => toRecord("x")).toThrow();
  });
});

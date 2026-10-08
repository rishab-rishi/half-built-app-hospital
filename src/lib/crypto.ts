import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function hmacHex(secret: string, purpose: string, data: string): string {
  // Purpose is part of the MAC input so one secret can never be confused across uses.
  return createHmac("sha256", secret).update(`${purpose}\u0000${data}`).digest("hex");
}

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Constant-time string comparison (length is not secret here). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Deterministic JSON: sorted keys, no whitespace. Used for hashing validated data. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function hashOf(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

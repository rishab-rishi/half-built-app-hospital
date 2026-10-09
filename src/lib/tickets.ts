import "./zod-config";
import { z } from "zod";
import { hmacHex, safeEqual } from "./crypto";

const payloadSchema = z.strictObject({
  v: z.literal(1),
  caseId: z.string().min(1).max(64),
  sessionHash: z.string().regex(/^[0-9a-f]{64}$/),
  intakeHash: z.string().regex(/^[0-9a-f]{64}$/),
  questionsHash: z.string().regex(/^[0-9a-f]{64}$/),
  exp: z.number().int().positive(),
});
export type TicketPayload = z.infer<typeof payloadSchema>;

/** Fixed canonical form that is MACed. Contains no case text, only IDs and hashes. */
function canonical(p: TicketPayload): string {
  return ["v1", p.caseId, p.sessionHash, p.intakeHash, p.questionsHash, p.exp].join("|");
}

export function signTicket(secret: string, p: TicketPayload): string {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${body}.${hmacHex(secret, "ticket", canonical(p))}`;
}

/** Signature, shape and expiry only. Session binding and Redis state are checked by the caller. */
export function verifyTicket(secret: string, token: string, now: number): TicketPayload | null {
  if (token.length > 1024) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  let parsed: TicketPayload;
  try {
    const json = JSON.parse(Buffer.from(token.slice(0, dot), "base64url").toString("utf8"));
    const r = payloadSchema.safeParse(json);
    if (!r.success) return null;
    parsed = r.data;
  } catch {
    return null;
  }
  if (!safeEqual(token.slice(dot + 1), hmacHex(secret, "ticket", canonical(parsed)))) return null;
  return parsed.exp > now ? parsed : null;
}

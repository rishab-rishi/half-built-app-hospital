import type { Intake } from "@/lib/schemas";

export type EvalCategory =
  | "clear"
  | "insufficient"
  | "conflicting"
  | "malicious"
  | "secret"
  | "auth_payment"
  | "non_latin"
  | "other";

/** Fictional evaluation case. Never contains real customer data or real credentials. */
export type EvalFixture = {
  id: string;
  category: EvalCategory;
  intake: Intake;
  /** The user explicitly reports an urgent, live-impact problem, so a P0 task is allowed. */
  urgentReported: boolean;
  /** Input is too sparse for a confident diagnosis. */
  expectInsufficient: boolean;
  /** Authentication, authorisation, payments, or data exposure: manual engineering review expected. */
  authOrPayment: boolean;
  /** Injected token the model must never echo back. */
  canary?: string;
  /** Contains credential-like text; the server must refuse it before any model call. */
  expectRejectedBeforeModel?: boolean;
};

export const FIXTURE_REVISION = "2026-10-09.1";

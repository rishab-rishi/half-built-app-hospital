// Browser-side helper for the three live endpoints. Safe to import from client components.

const CATEGORIES = [
  "invalid_request",
  "secret_detected",
  "forbidden",
  "challenge_failed",
  "consent_required",
  "too_large",
  "rate_limited",
  "already_completed",
  "case_state",
  "live_disabled",
  "capacity_reached",
  "provider_unavailable",
  "invalid_result",
] as const;
export type ApiCategory = (typeof CATEGORIES)[number];

export type ApiFailure = {
  ok: false;
  category: ApiCategory | "network" | "unknown";
  retryAfterSec?: number;
  requestId?: string;
};
export type ApiSuccess<T> = { ok: true; data: T };

/** One attempt, no automatic retry, no background re-submission. */
export async function postJson<T>(
  path: "/api/session" | "/api/triage" | "/api/diagnose",
  body: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiSuccess<T> | ApiFailure> {
  let res: Response;
  try {
    res = await fetchImpl(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { ok: false, category: "network" };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, category: "unknown" };
  }
  if (res.ok) return { ok: true, data: json as T };

  const o = (json ?? {}) as { error?: unknown; retryAfterSec?: unknown; requestId?: unknown };
  const category = (CATEGORIES as readonly unknown[]).includes(o.error) ? (o.error as ApiCategory) : "unknown";
  const header = Number(res.headers.get("retry-after"));
  const retryAfterSec =
    typeof o.retryAfterSec === "number" ? o.retryAfterSec : Number.isFinite(header) && header > 0 ? header : undefined;
  return {
    ok: false,
    category,
    ...(retryAfterSec ? { retryAfterSec } : {}),
    ...(typeof o.requestId === "string" ? { requestId: o.requestId.slice(0, 40) } : {}),
  };
}

function waitText(sec?: number): string {
  if (!sec) return "a moment";
  if (sec < 90) return `about ${sec} second${sec === 1 ? "" : "s"}`;
  if (sec < 5400) return `about ${Math.ceil(sec / 60)} minutes`;
  return `about ${Math.ceil(sec / 3600)} hours`;
}

export type FailureView = {
  message: string;
  /** Service-wide or persistent problems: point the visitor at the built-in samples. */
  offerSample: boolean;
  /** The visitor may deliberately try again (with a fresh challenge). Nothing retries automatically. */
  canRetry: boolean;
};

export function describeFailure(f: ApiFailure): FailureView {
  switch (f.category) {
    case "rate_limited":
      return {
        message: `You are going a little fast. Please wait ${waitText(f.retryAfterSec)} before trying again.`,
        offerSample: true,
        canRetry: true,
      };
    case "capacity_reached":
      return {
        message: "The hospital is busy: today's live assessments are used up. Come back later, or explore a sample patient now.",
        offerSample: true,
        canRetry: false,
      };
    case "live_disabled":
      return {
        message: "Live assessments are switched off right now. You can still explore a sample patient.",
        offerSample: true,
        canRetry: false,
      };
    case "provider_unavailable":
    case "network":
      return {
        message: "The assessment service could not be reached. Nothing was lost on your side; you can try again or explore a sample.",
        offerSample: true,
        canRetry: true,
      };
    case "invalid_result":
      return {
        message: "The assistant's answer did not pass our safety checks, so we are not showing it. This step cannot be repeated for this case.",
        offerSample: true,
        canRetry: false,
      };
    case "challenge_failed":
      return { message: "The human check did not pass. Please complete it again.", offerSample: false, canRetry: true };
    case "secret_detected":
      return {
        message: "Part of your text looks like a password, key, or token. Remove it (or replace it with a placeholder) and try again.",
        offerSample: false,
        canRetry: true,
      };
    case "too_large":
      return { message: "That is more text than we can handle. Please shorten it and try again.", offerSample: false, canRetry: true };
    case "invalid_request":
      return { message: "Some of the details were not accepted. Please check the fields and try again.", offerSample: false, canRetry: true };
    case "consent_required":
      return { message: "Please accept the current terms and privacy notice to continue.", offerSample: false, canRetry: true };
    case "already_completed":
    case "case_state":
      return {
        message: "This case has already used that step. Start a new case, or explore a sample.",
        offerSample: true,
        canRetry: false,
      };
    case "forbidden":
      return {
        message: "Your session was not accepted. Start a new case to continue.",
        offerSample: false,
        canRetry: false,
      };
    default:
      return { message: "Something went wrong. Please try again, or explore a sample.", offerSample: true, canRetry: true };
  }
}

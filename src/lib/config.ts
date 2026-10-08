import "server-only";

export type AppConfig = {
  /** True only when every security prerequisite is present and live mode is switched on. */
  live: boolean;
  /** Names of failed prerequisites. Never contains secret values. */
  blockedReasons: string[];
  origin: string;
  hostname: string;
  secureCookies: boolean;
  termsVersion: string;
  privacyVersion: string;
  namespace: string;
  turnstileSiteKey: string;
  secrets: { session: string; ip: string; ticket: string; turnstile: string };
  groq: { apiKey: string; model: string };
  redis: { url: string; token: string };
  limits: {
    globalPerMinute: number;
    globalPerDay: number;
    globalPerMonth: number;
    globalTokensPerDay: number;
    globalTokensPerMonth: number;
  };
};

type Env = Record<string, string | undefined>;

const MIN_SECRET_LENGTH = 32;
// Cloudflare documents dummy keys for development; they must never run in production.
const TURNSTILE_TEST_KEY = /^[123]x0{10,}[A-Za-z0-9]*$/;

function positiveInt(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function loadConfig(env: Env): AppConfig {
  const reasons: string[] = [];
  const need = (name: string): string => {
    const v = env[name]?.trim() ?? "";
    if (!v || v.startsWith("replace-") || v.startsWith("choose-") || v.startsWith("generate-")) {
      reasons.push(`${name} missing`);
      return "";
    }
    return v;
  };

  let origin = "";
  let hostname = "";
  try {
    const u = new URL(env.APP_ORIGIN ?? "");
    if (u.protocol !== "https:" && !(u.protocol === "http:" && isLocalHost(u.hostname))) {
      reasons.push("APP_ORIGIN must be https (or http on localhost)");
    } else {
      origin = u.origin;
      hostname = u.hostname;
    }
  } catch {
    reasons.push("APP_ORIGIN invalid");
  }

  const secrets = {
    session: need("SESSION_HMAC_SECRET"),
    ip: need("IP_HMAC_SECRET"),
    ticket: need("TICKET_HMAC_SECRET"),
    turnstile: need("TURNSTILE_SECRET_KEY"),
  };
  for (const name of ["session", "ip", "ticket"] as const) {
    if (secrets[name] && secrets[name].length < MIN_SECRET_LENGTH) reasons.push(`${name} secret too short`);
  }
  const hmacs = [secrets.session, secrets.ip, secrets.ticket].filter(Boolean);
  if (new Set(hmacs).size !== hmacs.length) reasons.push("HMAC secrets must be independent");

  const isProductionLike = origin.startsWith("https://") || env.VERCEL_ENV === "production";
  const turnstileSiteKey = need("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  if (isProductionLike && (TURNSTILE_TEST_KEY.test(secrets.turnstile) || TURNSTILE_TEST_KEY.test(turnstileSiteKey))) {
    reasons.push("Turnstile test keys are not allowed in production");
  }

  const groq = { apiKey: need("GROQ_API_KEY"), model: need("GROQ_MODEL") };
  const redis = { url: need("UPSTASH_REDIS_REST_URL"), token: need("UPSTASH_REDIS_REST_TOKEN") };
  const termsVersion = need("TERMS_VERSION");
  const privacyVersion = need("PRIVACY_VERSION");

  const live = env.LIVE_AI_ENABLED === "true";
  if (!live) reasons.push("LIVE_AI_ENABLED is not true");

  const namespace =
    env.REDIS_NAMESPACE?.trim() || `hh-${env.VERCEL_ENV ?? env.NODE_ENV ?? "dev"}`;

  return {
    live: live && reasons.length === 0,
    blockedReasons: reasons,
    origin,
    hostname,
    secureCookies: origin.startsWith("https://"),
    termsVersion,
    privacyVersion,
    namespace,
    turnstileSiteKey,
    secrets,
    groq,
    redis,
    limits: {
      globalPerMinute: 10,
      globalPerDay: positiveInt(env.GLOBAL_AI_CALLS_PER_DAY, 80),
      globalPerMonth: positiveInt(env.GLOBAL_AI_CALLS_PER_MONTH, 800),
      globalTokensPerDay: positiveInt(env.GLOBAL_AI_TOKENS_PER_DAY, 600_000),
      globalTokensPerMonth: positiveInt(env.GLOBAL_AI_TOKENS_PER_MONTH, 6_000_000),
    },
  };
}

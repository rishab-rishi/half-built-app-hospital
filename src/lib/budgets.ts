import type { Store } from "./redis";

/* ---------- Counter model ---------- */

export type Scope = "ip" | "session" | "global";
export type Counter = {
  key: string;
  limit: number;
  incr: number;
  ttlSec: number;
  scope: Scope;
  /** Seconds until this window resets, used for Retry-After. */
  retryAfterSec: number;
};

export const LIMITS = {
  attemptsPerMinuteIp: 10,
  attemptsPerDayIp: 100,
  sessionsPerDayIp: 5,
  casesPerDay: 2,
  modelCallsPerMinute: 2,
  modelCallsPerDay: 4,
  globalConcurrent: 2,
  sessionConcurrent: 1,
  providerDeadlineMs: 25_000,
  leaseMs: 40_000,
  caseTtlSec: 30 * 60,
  sessionTtlSec: 24 * 60 * 60,
  /** Max tokens reserved per call (input bound + output bound). */
  reserveTokens: { triage: 6000 + 450, diagnose: 6000 + 1800 },
} as const;

type Windows = { minute: string; day: string; month: string; toMinute: number; toDay: number; toMonth: number };

/** UTC calendar buckets and the seconds remaining in each. */
export function windows(nowMs: number): Windows {
  const d = new Date(nowMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getUTCFullYear();
  const mo = pad(d.getUTCMonth() + 1);
  const nextMinute = (Math.floor(nowMs / 60_000) + 1) * 60_000;
  const nextDay = Date.UTC(y, d.getUTCMonth(), d.getUTCDate() + 1);
  const nextMonth = Date.UTC(y, d.getUTCMonth() + 1, 1);
  return {
    minute: `${y}${mo}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`,
    day: `${y}${mo}${pad(d.getUTCDate())}`,
    month: `${y}${mo}`,
    toMinute: Math.ceil((nextMinute - nowMs) / 1000),
    toDay: Math.ceil((nextDay - nowMs) / 1000),
    toMonth: Math.ceil((nextMonth - nowMs) / 1000),
  };
}

const GRACE = { minute: 60, day: 3600, month: 86_400 };

type Unit = "minute" | "day" | "month";
function counter(
  ns: string,
  scope: Scope,
  name: string,
  id: string,
  unit: Unit,
  w: Windows,
  limit: number,
  incr = 1,
): Counter {
  const remaining = unit === "minute" ? w.toMinute : unit === "day" ? w.toDay : w.toMonth;
  return {
    key: `${ns}:c:${name}:${id}:${w[unit]}`,
    limit,
    incr,
    ttlSec: remaining + GRACE[unit],
    scope,
    retryAfterSec: remaining,
  };
}

export type GlobalLimits = {
  globalPerMinute: number;
  globalPerDay: number;
  globalPerMonth: number;
  globalTokensPerDay: number;
  globalTokensPerMonth: number;
};

/** Every live POST attempt, including ones that are later rejected. */
export function attemptCounters(ns: string, ipHash: string, now: number): Counter[] {
  const w = windows(now);
  return [
    counter(ns, "ip", "attempt-m", ipHash, "minute", w, LIMITS.attemptsPerMinuteIp),
    counter(ns, "ip", "attempt-d", ipHash, "day", w, LIMITS.attemptsPerDayIp),
  ];
}

export function admitCounters(
  ns: string,
  ipHash: string,
  sessionHash: string,
  newSession: boolean,
  now: number,
): Counter[] {
  const w = windows(now);
  const list = [
    counter(ns, "ip", "case-d", ipHash, "day", w, LIMITS.casesPerDay),
    counter(ns, "session", "case-d", sessionHash, "day", w, LIMITS.casesPerDay),
  ];
  if (newSession) list.push(counter(ns, "ip", "session-d", ipHash, "day", w, LIMITS.sessionsPerDayIp));
  return list;
}

export function reserveCounters(
  ns: string,
  stage: "triage" | "diagnose",
  ipHash: string,
  sessionHash: string,
  g: GlobalLimits,
  now: number,
): Counter[] {
  const w = windows(now);
  const tokens = LIMITS.reserveTokens[stage];
  return [
    counter(ns, "ip", "ai-m", ipHash, "minute", w, LIMITS.modelCallsPerMinute),
    counter(ns, "ip", "ai-d", ipHash, "day", w, LIMITS.modelCallsPerDay),
    counter(ns, "session", "ai-m", sessionHash, "minute", w, LIMITS.modelCallsPerMinute),
    counter(ns, "session", "ai-d", sessionHash, "day", w, LIMITS.modelCallsPerDay),
    counter(ns, "global", "ai-m", "all", "minute", w, g.globalPerMinute),
    counter(ns, "global", "ai-d", "all", "day", w, g.globalPerDay),
    counter(ns, "global", "ai-mo", "all", "month", w, g.globalPerMonth),
    counter(ns, "global", "tok-d", "all", "day", w, g.globalTokensPerDay, tokens),
    counter(ns, "global", "tok-mo", "all", "month", w, g.globalTokensPerMonth, tokens),
  ];
}

/* ---------- Key names ---------- */

export const keys = {
  session: (ns: string, sessionHash: string) => `${ns}:sess:${sessionHash}`,
  caseRec: (ns: string, caseId: string) => `${ns}:case:${caseId}`,
  globalLease: (ns: string) => `${ns}:lease:global`,
  sessionLease: (ns: string, sessionHash: string) => `${ns}:lease:sess:${sessionHash}`,
  kill: (ns: string) => `${ns}:kill`,
};

/* ---------- Lua ----------
 * All scripts: KEYS[1..n] are counters, ARGV[1] = n, ARGV[2 + 3*(i-1) ..] = limit, incr, ttl.
 * Checks run first; nothing is written unless every check passes (all-or-nothing).
 */

const PRELUDE = `
local n = tonumber(ARGV[1])
local function firstExceeded()
  for i = 1, n do
    local limit = tonumber(ARGV[2 + (i - 1) * 3])
    local incr = tonumber(ARGV[3 + (i - 1) * 3])
    local cur = tonumber(redis.call('GET', KEYS[i]) or '0')
    if cur + incr > limit then return i end
  end
  return 0
end
local function applyCounters()
  for i = 1, n do
    local incr = tonumber(ARGV[3 + (i - 1) * 3])
    local ttl = tonumber(ARGV[4 + (i - 1) * 3])
    local v = redis.call('INCRBY', KEYS[i], incr)
    if v == incr then redis.call('EXPIRE', KEYS[i], ttl) end
  end
end
local o = 1 + n * 3
`;

const HIT = `${PRELUDE}
local bad = firstExceeded()
if bad > 0 then return {0, 'counter', bad} end
applyCounters()
return {1}
`;

// KEYS: counters, then session, case.  ARGV after triples: newSession, sessionTtl, caseTtl,
// caseId, sessionHash, termsVersion, privacyVersion, nowIso
const ADMIT = `${PRELUDE}
local sessionKey, caseKey = KEYS[n + 1], KEYS[n + 2]
local newSession = ARGV[o + 1] == '1'
if not newSession and redis.call('EXISTS', sessionKey) == 0 then return {0, 'no_session'} end
local bad = firstExceeded()
if bad > 0 then return {0, 'counter', bad} end
applyCounters()
if newSession then
  redis.call('HSET', sessionKey, 'terms', ARGV[o + 6], 'privacy', ARGV[o + 7], 'acceptedAt', ARGV[o + 8], 'createdAt', ARGV[o + 8])
  redis.call('EXPIRE', sessionKey, tonumber(ARGV[o + 2]))
end
redis.call('HSET', caseKey, 'state', 'admitted', 'sessionHash', ARGV[o + 5], 'terms', ARGV[o + 6], 'privacy', ARGV[o + 7])
redis.call('EXPIRE', caseKey, tonumber(ARGV[o + 3]))
return {1}
`;

// KEYS: counters, then case, globalLease, sessionLease, kill.
// ARGV after triples: now, token, from, to, sessionHash, globalLeaseLimit, sessionLeaseLimit, leaseMs
const RESERVE = `${PRELUDE}
local caseKey, gKey, sKey, killKey = KEYS[n + 1], KEYS[n + 2], KEYS[n + 3], KEYS[n + 4]
local now = tonumber(ARGV[o + 1])
local token, from, to, shash = ARGV[o + 2], ARGV[o + 3], ARGV[o + 4], ARGV[o + 5]
local gLimit, sLimit, leaseMs = tonumber(ARGV[o + 6]), tonumber(ARGV[o + 7]), tonumber(ARGV[o + 8])
if redis.call('GET', killKey) == '1' then return {0, 'live_disabled'} end
if redis.call('HGET', caseKey, 'state') ~= from or redis.call('HGET', caseKey, 'sessionHash') ~= shash then
  return {0, 'case_state'}
end
local bad = firstExceeded()
if bad > 0 then return {0, 'counter', bad} end
redis.call('ZREMRANGEBYSCORE', gKey, '-inf', now)
redis.call('ZREMRANGEBYSCORE', sKey, '-inf', now)
if redis.call('ZCARD', gKey) >= gLimit then return {0, 'busy_global'} end
if redis.call('ZCARD', sKey) >= sLimit then return {0, 'busy_session'} end
applyCounters()
redis.call('ZADD', gKey, now + leaseMs, token)
redis.call('ZADD', sKey, now + leaseMs, token)
redis.call('EXPIRE', gKey, math.ceil(leaseMs / 1000) + 60)
redis.call('EXPIRE', sKey, math.ceil(leaseMs / 1000) + 60)
redis.call('HSET', caseKey, 'state', to)
return {1}
`;

// KEYS: case, globalLease, sessionLease.  ARGV: token, from, to, nFields, k1, v1, ...
// Releases only the caller's own lease (members are unique tokens), then transitions state.
const FINISH = `
local caseKey, gKey, sKey = KEYS[1], KEYS[2], KEYS[3]
redis.call('ZREM', gKey, ARGV[1])
redis.call('ZREM', sKey, ARGV[1])
if redis.call('HGET', caseKey, 'state') ~= ARGV[2] then return {0, 'case_state'} end
redis.call('HSET', caseKey, 'state', ARGV[3])
local nf = tonumber(ARGV[4])
for i = 1, nf do
  redis.call('HSET', caseKey, ARGV[3 + i * 2], ARGV[4 + i * 2])
end
return {1}
`;

const RELEASE = `
redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
return {1}
`;

/* ---------- Typed wrappers ---------- */

function flat(counters: Counter[]): { keys: string[]; args: (string | number)[] } {
  return {
    keys: counters.map((c) => c.key),
    args: [counters.length, ...counters.flatMap((c) => [c.limit, c.incr, c.ttlSec])],
  };
}

export type CounterDenial = { ok: false; reason: "counter"; counter: Counter };

function counterDenial(counters: Counter[], r: unknown[]): CounterDenial {
  return { ok: false, reason: "counter", counter: counters[Number(r[2]) - 1] };
}

/** Per-IP attempt gate. Applied to every live POST before any provider (including Turnstile) call. */
export async function recordAttempt(
  store: Store,
  counters: Counter[],
): Promise<{ ok: true } | CounterDenial> {
  const f = flat(counters);
  const r = await store.eval(HIT, f.keys, f.args);
  return Number(r[0]) === 1 ? { ok: true } : counterDenial(counters, r);
}

export type AdmitResult =
  | { ok: true }
  | CounterDenial
  | { ok: false; reason: "no_session" };

export async function admitCase(
  store: Store,
  p: {
    ns: string;
    counters: Counter[];
    newSession: boolean;
    sessionHash: string;
    caseId: string;
    termsVersion: string;
    privacyVersion: string;
    nowIso: string;
  },
): Promise<AdmitResult> {
  const f = flat(p.counters);
  const r = await store.eval(
    ADMIT,
    [...f.keys, keys.session(p.ns, p.sessionHash), keys.caseRec(p.ns, p.caseId)],
    [
      ...f.args,
      p.newSession ? "1" : "0",
      LIMITS.sessionTtlSec,
      LIMITS.caseTtlSec,
      p.caseId,
      p.sessionHash,
      p.termsVersion,
      p.privacyVersion,
      p.nowIso,
    ],
  );
  if (Number(r[0]) === 1) return { ok: true };
  if (r[1] === "no_session") return { ok: false, reason: "no_session" };
  return counterDenial(p.counters, r);
}

export type ReserveResult =
  | { ok: true }
  | CounterDenial
  | { ok: false; reason: "live_disabled" | "case_state" | "busy_global" | "busy_session" };

/**
 * Atomically: kill-switch, case-state precondition, every budget, both concurrency leases,
 * then increment + lease + state transition. A loser of a race never reaches the provider.
 */
export async function reserveModelCall(
  store: Store,
  p: {
    ns: string;
    caseId: string;
    sessionHash: string;
    from: "admitted" | "triaged";
    to: "triaging" | "diagnosing";
    counters: Counter[];
    token: string;
    now: number;
  },
): Promise<ReserveResult> {
  const f = flat(p.counters);
  const r = await store.eval(
    RESERVE,
    [
      ...f.keys,
      keys.caseRec(p.ns, p.caseId),
      keys.globalLease(p.ns),
      keys.sessionLease(p.ns, p.sessionHash),
      keys.kill(p.ns),
    ],
    [
      ...f.args,
      p.now,
      p.token,
      p.from,
      p.to,
      p.sessionHash,
      LIMITS.globalConcurrent,
      LIMITS.sessionConcurrent,
      LIMITS.leaseMs,
    ],
  );
  if (Number(r[0]) === 1) return { ok: true };
  if (r[1] === "counter") return counterDenial(p.counters, r);
  return { ok: false, reason: r[1] as "live_disabled" | "case_state" | "busy_global" | "busy_session" };
}

/** Release the caller's leases and move the case on. Counters are never decremented. */
export async function finishModelCall(
  store: Store,
  p: {
    ns: string;
    caseId: string;
    sessionHash: string;
    token: string;
    from: "triaging" | "diagnosing";
    to: "triaged" | "completed" | "failed";
    fields?: Record<string, string>;
  },
): Promise<boolean> {
  const fields = Object.entries(p.fields ?? {});
  const r = await store.eval(
    FINISH,
    [keys.caseRec(p.ns, p.caseId), keys.globalLease(p.ns), keys.sessionLease(p.ns, p.sessionHash)],
    [p.token, p.from, p.to, fields.length, ...fields.flat()],
  );
  return Number(r[0]) === 1;
}

export async function releaseLease(
  store: Store,
  p: { ns: string; sessionHash: string; token: string },
): Promise<void> {
  await store.eval(RELEASE, [keys.globalLease(p.ns), keys.sessionLease(p.ns, p.sessionHash)], [p.token]);
}

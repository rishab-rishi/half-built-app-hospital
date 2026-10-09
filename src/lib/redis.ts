import "server-only";
import { Redis } from "@upstash/redis";

/**
 * The only Redis surface the app uses. Every multi-key decision goes through `eval` so it is atomic.
 * Implementations must throw on failure; callers treat any throw as "fail closed".
 */
export interface Store {
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown[]>;
  get(key: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string> | null>;
}

/**
 * With automatic deserialisation off, Upstash returns HGETALL as a flat [field, value, ...] array
 * (verified against a live database). Normalise to a record; empty means the key does not exist.
 */
export function toRecord(raw: unknown): Record<string, string> | null {
  if (raw === null || raw === undefined) return null;
  const out: Record<string, string> = Object.create(null);
  if (Array.isArray(raw)) {
    if (raw.length % 2 !== 0) throw new Error("malformed hash reply");
    for (let i = 0; i < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1]);
  } else if (typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) out[k] = String(v);
  } else {
    throw new Error("malformed hash reply");
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function upstashStore(url: string, token: string): Store {
  // Deserialisation off: numeric-looking strings must stay strings (hashes, versions).
  const redis = new Redis({ url, token, automaticDeserialization: false, retry: false });
  return {
    async eval(script, keys, args) {
      const r = await redis.eval(script, keys, args);
      if (!Array.isArray(r)) throw new Error("unexpected script result");
      return r;
    },
    async get(key) {
      const v = await redis.get<string | null>(key);
      return v === null || v === undefined ? null : String(v);
    },
    async hgetall(key) {
      return toRecord(await redis.hgetall(key));
    },
  };
}

/** Bounds every Redis call so a hung connection cannot hang a request open. */
export function withTimeout(store: Store, ms: number): Store {
  const bound = <T>(p: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("store timeout")), ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });
  return {
    eval: (s, k, a) => bound(store.eval(s, k, a)),
    get: (k) => bound(store.get(k)),
    hgetall: (k) => bound(store.hgetall(k)),
  };
}

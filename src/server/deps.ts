import "server-only";
import { groqProvider } from "@/lib/ai";
import { trustedClientIp } from "@/lib/client-ip";
import { loadConfig } from "@/lib/config";
import { randomToken } from "@/lib/crypto";
import { upstashStore, withTimeout, type Store } from "@/lib/redis";
import type { Deps } from "./handlers";

let cached: Deps | null = null;

const unavailable = (): never => {
  throw new Error("live mode is off");
};

/** Production wiring. When live mode is off, no provider or store is ever constructed. */
export function getDeps(): Deps {
  if (cached) return cached;
  const config = loadConfig(process.env);
  const store: Store = config.live
    ? withTimeout(upstashStore(config.redis.url, config.redis.token), 2500)
    : { eval: unavailable, get: unavailable, hgetall: unavailable };
  cached = {
    config,
    store,
    provider: config.live
      ? groqProvider(config.groq.apiKey, config.groq.model)
      : { complete: unavailable },
    fetch: (...args) => fetch(...args),
    now: () => Date.now(),
    randomId: () => randomToken(16),
    clientIp: (req) => trustedClientIp(req.headers, process.env),
    // Allowlisted fields only: no prompts, outputs, IPs, cookies, tickets, or tokens.
    log: (e) => console.log(JSON.stringify(e)),
  };
  return cached;
}

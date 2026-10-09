// Fails if the browser-visible build output could expose a server secret.
// Run after `next build`:  npm run scan:bundle
// With a .env.local present it also looks for the actual secret values:  node --env-file=.env.local scripts/scan-bundle.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = ".next/static";
const PUBLIC_OK = new Set(["APP_ORIGIN", "TERMS_VERSION", "PRIVACY_VERSION", "LIVE_AI_ENABLED", "REDIS_NAMESPACE", "NODE_ENV"]);
const SERVER_ONLY_NAMES = [
  "GROQ_API_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "TURNSTILE_SECRET_KEY",
  "SESSION_HMAC_SECRET",
  "IP_HMAC_SECRET",
  "TICKET_HMAC_SECRET",
];
const PATTERNS = [
  [/gsk_[A-Za-z0-9]{20,}/, "Groq-style key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key id"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key block"],
  [/\bsk_(live|test)_[A-Za-z0-9]{16,}/, "Stripe key"],
];

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let files;
try {
  files = walk(ROOT).filter((f) => /\.(js|css|html|json|map|txt)$/.test(f));
} catch {
  console.error(`No build output at ${ROOT}. Run "npm run build" first.`);
  process.exit(2);
}

const secretValues = Object.entries(process.env)
  .filter(([k, v]) => v && v.length >= 12 && !k.startsWith("NEXT_PUBLIC_") && !PUBLIC_OK.has(k) && SERVER_ONLY_NAMES.includes(k))
  .map(([k, v]) => [k, v]);

const problems = [];
for (const f of files) {
  const text = readFileSync(f, "utf8");
  for (const name of SERVER_ONLY_NAMES) if (text.includes(name)) problems.push(`${f}: mentions server-only variable name ${name}`);
  for (const [name, value] of secretValues) if (text.includes(value)) problems.push(`${f}: contains the VALUE of ${name}`);
  for (const [re, label] of PATTERNS) if (re.test(text)) problems.push(`${f}: matches ${label}`);
}

console.log(`Scanned ${files.length} files in ${ROOT}; checked ${secretValues.length} secret values and ${SERVER_ONLY_NAMES.length} variable names.`);
if (problems.length) {
  console.error("PROBLEMS:\n" + problems.slice(0, 20).join("\n"));
  process.exit(1);
}
console.log("OK: no server secrets found in browser-visible output.");

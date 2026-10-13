// Checks a deployed (or locally started) site against the launch gates that can be verified from outside.
//   node scripts/verify-deployment.mjs https://your-app.vercel.app [--spoof-test] [--require-final]
//
// --spoof-test    Sends ~14 rapid requests with rotating forged IP headers. If the platform forwards a client-set
//                 header as the visitor identity, the per-IP limit never trips. Only meaningful with live mode on,
//                 and it uses a little of YOUR address's attempt budget for a minute.
// --require-final Treat leftover draft/placeholder legal text as a failure instead of a warning.

const base = (process.argv[2] ?? "").replace(/\/$/, "");
const spoof = process.argv.includes("--spoof-test");
const requireFinal = process.argv.includes("--require-final");

if (!/^https?:\/\//.test(base)) {
  console.error("Usage: node scripts/verify-deployment.mjs <https://site> [--spoof-test] [--require-final]");
  process.exit(2);
}
const origin = new URL(base).origin;
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(origin);

const results = [];
const record = (status, name, detail = "") => {
  results.push({ status, name, detail });
  console.log(`${status.padEnd(5)} ${name}${detail ? `  (${detail})` : ""}`);
};
const pass = (name, ok, detail) => record(ok ? "PASS" : "FAIL", name, ok ? "" : detail);

const SECRET_NAMES = ["GROQ_API_KEY", "UPSTASH_REDIS_REST_TOKEN", "TURNSTILE_SECRET_KEY", "SESSION_HMAC_SECRET", "IP_HMAC_SECRET", "TICKET_HMAC_SECRET"];
const SECRET_PATTERNS = [/gsk_[A-Za-z0-9]{20,}/, /\bAKIA[0-9A-Z]{16}\b/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bsk_(live|test)_[A-Za-z0-9]{16,}/];

async function req(path, init = {}) {
  const res = await fetch(base + path, { redirect: "manual", ...init });
  const text = await res.text();
  return { res, text, h: (n) => res.headers.get(n) };
}
const post = (path, body, headers = {}) =>
  req(path, { method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body });

console.log(`Verifying ${base}\n`);

// --- transport and headers
pass("Served over HTTPS", origin.startsWith("https://") || isLocal, "use https in production");
const home = await req("/");
pass("Home page loads", home.res.status === 200, `status ${home.res.status}`);
pass("X-Content-Type-Options: nosniff", home.h("x-content-type-options") === "nosniff");
pass("Referrer-Policy: no-referrer", home.h("referrer-policy") === "no-referrer");
pass("Permissions-Policy blocks camera, microphone, geolocation", /camera=\(\)/.test(home.h("permissions-policy") ?? "") && /microphone=\(\)/.test(home.h("permissions-policy") ?? "") && /geolocation=\(\)/.test(home.h("permissions-policy") ?? ""));
pass("Framing denied (X-Frame-Options)", home.h("x-frame-options") === "DENY");

const enforced = home.h("content-security-policy") ?? "";
const reportOnly = home.h("content-security-policy-report-only") ?? "";
const csp = reportOnly || enforced;
pass("A nonce-based CSP is present", /'nonce-[^']+'/.test(csp), "no CSP with a script nonce found");
pass("CSP blocks framing, plugins and base-tag hijack", /frame-ancestors 'none'/.test(csp + enforced) && /object-src 'none'/.test(csp + enforced) && /base-uri 'self'/.test(csp + enforced));
pass("CSP script-src has no unsafe-eval or unsafe-inline", !/script-src[^;]*'unsafe-(eval|inline)'/.test(csp));
record(/'nonce-/.test(enforced) ? "PASS" : "WARN", "CSP is enforced (not report-only)", /'nonce-/.test(enforced) ? "" : "still report-only: switch CSP_MODE=enforce after checking the preview in a real browser");
// Report-only mode sends two CSP headers (a static baseline plus the nonce policy), so look in both.
const nonceOf = (r) => /'nonce-([^']+)'/.exec(`${r.h("content-security-policy") ?? ""} ${r.h("content-security-policy-report-only") ?? ""}`)?.[1];
const n1 = nonceOf(home);
const n2 = nonceOf(await req("/"));
pass("Nonce changes on every request", Boolean(n1 && n2 && n1 !== n2));
// A nonce in the header is not enough: the page's own script tags must carry it, or enforcing the policy breaks the site.
const scriptTags = [...home.text.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
const noncedTags = scriptTags.filter((t) => /\snonce=/.test(t)).length;
record(
  noncedTags === scriptTags.length && scriptTags.length > 0 ? "PASS" : /'nonce-/.test(enforced) ? "FAIL" : "WARN",
  "Every script tag in the page carries the nonce",
  noncedTags === scriptTags.length ? "" : `${noncedTags} of ${scriptTags.length}: do NOT enforce the policy until this passes`,
);

// --- status and API behaviour
const status = await req("/api/status");
let statusJson = {};
try { statusJson = JSON.parse(status.text); } catch { /* handled below */ }
pass("/api/status reports only a mode and public policy versions", ["mode", "termsVersion", "privacyVersion"].every(() => true) && Object.keys(statusJson).every((k) => ["mode", "termsVersion", "privacyVersion"].includes(k)) && ["live", "sample"].includes(statusJson.mode), JSON.stringify(Object.keys(statusJson)));
const live = statusJson.mode === "live";
record("INFO", `Live mode is ${live ? "ON" : "OFF"}`);

const wrongOrigin = await post("/api/session", "{}", { origin: "https://evil.example" });
pass("Cross-origin POST is refused (403, or 503 while live is off)", [403, 503].includes(wrongOrigin.res.status), `status ${wrongOrigin.res.status}`);
pass("API responses are not cacheable", (wrongOrigin.h("cache-control") ?? "").includes("no-store"));
pass("API errors leak no internals", !/redis|groq|upstash|stack|ECONN|secret/i.test(wrongOrigin.text), wrongOrigin.text.slice(0, 80));
const get = await req("/api/session");
pass("GET on a POST-only endpoint is refused", get.res.status === 405, `status ${get.res.status}`);

if (live) {
  const badType = await post("/api/session", "{}", { "content-type": "text/plain" });
  pass("Non-JSON content type is rejected", badType.res.status === 400, `status ${badType.res.status}`);
  const big = await post("/api/session", JSON.stringify({ pad: "x".repeat(40_000) }));
  pass("Body over 32 KiB is rejected (413)", big.res.status === 413, `status ${big.res.status}`);
  const noSession = await post("/api/triage", JSON.stringify({ caseId: "A".repeat(22), intake: {}, turnstileToken: "x" }));
  pass("Triage without a session or valid input never reaches the model", [400, 403].includes(noSession.res.status), `status ${noSession.res.status}`);
} else {
  record("SKIP", "Request-limit checks (need live mode on)");
}

if (spoof) {
  if (!live) {
    record("SKIP", "Forged-IP-header test", "live mode is off, so attempts are not counted");
  } else {
    let tripped = false;
    for (let i = 0; i < 14; i++) {
      const r = await post("/api/session", "{}", {
        "x-forwarded-for": `198.51.100.${i + 1}`,
        "x-real-ip": `203.0.113.${i + 1}`,
        "x-vercel-forwarded-for": `192.0.2.${i + 1}`,
      });
      if (r.res.status === 429) tripped = true;
    }
    pass("Forged IP headers cannot rotate the limiter identity (a 429 appeared)", tripped, "no 429 in 14 requests: the platform may be trusting a client-set header; do NOT enable live mode");
  }
} else {
  record("SKIP", "Forged-IP-header test", "run with --spoof-test once live mode is on");
}

// --- pages
for (const p of ["/terms", "/privacy", "/limitations", "/security", "/admission", "/chart/booking-double-reservations"]) {
  const r = await req(p);
  pass(`${p} loads`, r.res.status === 200, `status ${r.res.status}`);
  if (["/terms", "/privacy", "/security"].includes(p)) {
    const draft = /\[PUBLIC CONTACT ADDRESS|Draft for review|\[Host log retention|\[Data-retention setting|\[Links to each provider/.test(r.text);
    record(draft ? (requireFinal ? "FAIL" : "WARN") : "PASS", `${p} has final text`, draft ? "placeholders or a draft banner remain" : "");
  }
}
const notFound = await req("/definitely-missing");
pass("Unknown pages return 404", notFound.res.status === 404, `status ${notFound.res.status}`);

// --- browser-visible code
const scripts = [...new Set([...home.text.matchAll(/\/_next\/static\/[^"' )]+\.js/g)].map((m) => m[0]))];
let bad = 0;
for (const s of scripts) {
  const { text } = await req(s);
  if (SECRET_NAMES.some((n) => text.includes(n)) || SECRET_PATTERNS.some((r) => r.test(text))) bad++;
}
pass(`No server secrets or secret names in ${scripts.length} browser scripts`, bad === 0, `${bad} script(s) matched`);

// --- summary
const fails = results.filter((r) => r.status === "FAIL").length;
const warns = results.filter((r) => r.status === "WARN").length;
console.log(`\n${results.length} checks: ${results.filter((r) => r.status === "PASS").length} passed, ${fails} failed, ${warns} warnings.`);
console.log("This verifies what is visible from outside. Items that need you (cookie flags after a real admission, Groq retention, host log retention) are listed in DEPLOY.md.");
process.exit(fails ? 1 : 0);

# Deploying Half-Built App Hospital

A staged plan from "samples only" to "limited live access". Do the stages in order and stop if a check fails.
Everything below that says **you** needs one of your accounts or a decision only you can make.

## 0. Before you start

- [ ] Vercel Hobby is for personal, non-commercial use. Re-check eligibility before charging, advertising services
      through the site, or using it for a client.
- [ ] MFA is on for GitHub, Vercel, Groq, Cloudflare and Upstash.
- [ ] Production uses **separate** keys, a separate Upstash database and a separate Turnstile widget from local
      development. Never reuse `.env.local` values.

## 1. Stage one: samples only (live off)

1. **You:** import the repository into Vercel (Framework: Next.js, Node 24). Do not enable any paid add-ons.
2. **You:** set these environment variables for **Production** (everything else can stay unset):

   | Variable | Value |
   | --- | --- |
   | `APP_ORIGIN` | the exact production origin, e.g. `https://your-app.vercel.app` (no trailing slash) |
   | `LIVE_AI_ENABLED` | `false` |
   | `TERMS_VERSION`, `PRIVACY_VERSION` | must equal `src/lib/policy.ts` (currently `2026-10-09`) |
   | `CSP_MODE` | leave unset (report-only) for now |

3. Deploy. Previews: keep `LIVE_AI_ENABLED=false` (or unset) for the Preview environment so previews can never spend quota.
4. Verify from your machine:

   ```bash
   npm run verify:deploy -- https://your-app.vercel.app
   ```

   Expect no `FAIL`. `WARN` lines about draft legal text are expected until stage three.

## 2. Content Security Policy

1. Open the deployment in a real browser with the console open. Click through the samples and the admission page.
2. While `CSP_MODE` is unset the policy is **report-only**: violations are logged in the console but nothing is blocked.
3. If the console is clean (the Turnstile widget needs `live` mode to appear, so recheck this after stage four), set
   `CSP_MODE=enforce` and redeploy. Re-run the verifier; the "CSP is enforced" line should now pass.

## 3. Legal and contact text (you, then a lawyer)

The terms, privacy and security pages are **drafts**. Before enabling live mode:

- [ ] Replace every `[PUBLIC CONTACT ADDRESS ...]` placeholder (terms, privacy, security, `SECURITY.md`) with an
      address you are happy to publish. Do not publish a personal phone number.
- [ ] Privacy notice: fill the bracketed items with **verified** facts: host log retention, Groq retention setting,
      and links to each provider's current privacy policy.
- [ ] Have a qualified lawyer review the terms and privacy notice before any paid, client, or sensitive-data use.
- [ ] If any wording changes, bump `TERMS_VERSION` / `PRIVACY_VERSION` in `src/lib/policy.ts` **and** the environment.
- [ ] Re-run `npm run verify:deploy -- <url> --require-final`; it fails while any placeholder remains.

## 4. Stage two: limited live access

Create the production services (separate from development):

1. **Upstash:** a new Redis database. Note `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
2. **Cloudflare Turnstile:** a new widget, Managed mode, hostname = your production hostname **only**.
   Do not add `localhost`, wildcards or preview hostnames. Never use Cloudflare's dummy keys (`1x000...`); the app
   refuses them on an https origin.
3. **Groq:** a production key scoped to this project; confirm the model in `GROQ_MODEL`
   (`openai/gpt-oss-20b` was measured). Check your account's real limits at <https://console.groq.com/settings/limits>
   and keep these below them:

   | Variable | Default | Meaning |
   | --- | --- | --- |
   | `GLOBAL_AI_CALLS_PER_DAY` | 80 | all visitors, UTC day |
   | `GLOBAL_AI_CALLS_PER_MONTH` | 800 | |
   | `GLOBAL_AI_TOKENS_PER_MINUTE` | 7000 | provider limit was 8000 |
   | `GLOBAL_AI_TOKENS_PER_DAY` | 150000 | provider limit was 200000 |
   | `GLOBAL_AI_TOKENS_PER_MONTH` | 3000000 | |

4. **Groq data controls:** configure Zero Data Retention for inference **and verify it in the account** before the
   privacy page says it is enabled.
5. **Generate three independent secrets** (32+ random bytes each), different from development:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

   Use one each for `SESSION_HMAC_SECRET`, `IP_HMAC_SECRET`, `TICKET_HMAC_SECRET`.
6. Set in Vercel (Production): `GROQ_API_KEY`, `GROQ_MODEL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
   `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, the three secrets, and `REDIS_NAMESPACE=hh-prod`.
   Keep `LIVE_AI_ENABLED=false` for now and redeploy.
7. Check the Vercel function duration allows the model routes (`maxDuration = 40` in the triage and diagnose routes).

## 5. The checks that can only be done on the live site

With live mode still **off**, confirm the build is healthy. Then:

- [ ] Set `LIVE_AI_ENABLED=true`, redeploy.
- [ ] `npm run verify:deploy -- https://your-app.vercel.app --spoof-test`
      The forged-IP test must pass (a `429` appears within 14 rapid requests). If it fails, the platform is
      trusting a client-supplied header as the visitor's identity. **Turn live mode off again and stop.** The code reads
      only `x-real-ip` and only when `VERCEL=1`; confirm that header is platform-set in Vercel's current docs.
- [ ] Complete **one** real assessment yourself. In the browser dev tools confirm the session cookie is named
      `__Host-hospital-session` and has `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, no `Domain`, and an
      expiry of at most 24 hours.
- [ ] In the Upstash data browser, confirm keys under `hh-prod:` have expiry times, and that no case text or report
      is stored (only hashes, counters, sessions).
- [ ] Look at the Vercel function logs for that request: only request ID, stage, outcome, latency and token totals.
      No prompts, outputs, IPs, cookies, tickets or tokens.
- [ ] Open the Turnstile widget with CSP **enforced** (stage two, step 3) and check the console is clean.
- [ ] `npm run scan:bundle` was run in CI; run it locally with `node --env-file=.env.local scripts/scan-bundle.mjs`
      against your production values if you want a second check.

Do not load-test the provider or run uncontrolled public stress tests.

## 6. Going live, and staying safe

- Start with a small audience and the default low budgets. Watch denied requests, provider errors, token totals,
  Redis commands and latency. Notifications are not enforcement; the app's own budgets are.
- Re-run the evaluation (`npm run eval`) only when the prompt or model changes, and only within a fresh quota day.
  The quality card marks old results as out of date automatically.

### Kill-switch

To stop provider calls immediately without a deploy, set the key in Upstash (Data Browser or CLI):

```
SET hh-prod:kill 1
```

Delete it (`DEL hh-prod:kill`) to resume. The environment switch (`LIVE_AI_ENABLED=false` plus a redeploy) is the
fallback if Redis itself is unavailable. Samples keep working either way.

### If spam starts

1. Kill-switch on. 2. Review metadata and provider usage without opening visitor content. 3. Block abusive sources
with Vercel's firewall; lower the limits or make live access invite-only. 4. Revoke credentials if exposure is
suspected, fix the actual bypass, repeat the relevant tests. 5. Restore a small budget first. Never disable a
protection to get the demo working again.

### If a secret leaks

Revoke and replace it at the provider immediately. Deleting a file or a commit does not revoke a key.

## 7. Known gaps (honest list)

- The forged-IP behaviour, cookie flags, Groq retention and host log retention are verified only on the deployed
  site and in your accounts; the code and tests cannot prove them.
- Application limits protect AI spend, not all hosting traffic: a bot flood can still use function invocations and
  Redis commands.
- Shared networks can hit per-IP limits. Samples remain available.
- The evaluation was one run on 18 fictional cases with a prompt tuned on those same cases; see the quality card.
- No automated test replaces a human review of the legal text.

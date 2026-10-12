# Half-Built App Hospital

Describe an unfinished app and get a **provisional, evidence-linked recovery plan**: up to three clarifying
questions, a diagnosis that separates reported facts from hypotheses, and an editable recovery board you check off
yourself. It reads text only. It does not scan, run, or certify anything.

Three fictional patients work with no sign-in and no AI calls. Live assessments are off by default and gated by
a human check, per-IP and per-session limits, and global budgets.

> **Status:** a personal portfolio project. The sample experience is complete. Live mode is built and tested but
> switched off until the deployment checks and the final legal text are done. The terms and privacy pages are
> drafts with placeholders, not reviewed by a lawyer.

## What it does

- **Sample patients:** explore a full chart with no accounts: evidence drawer, recovery board, discharge checklist,
  and a Markdown export.
- **Evidence you can inspect:** every observation, hypothesis and task points to the exact text you supplied. The
  model never supplies quotations; unknown references are removed and the report is marked incomplete.
- **Checklist you own:** a task becomes *Verified* only after you tick every acceptance criterion and confirm you ran
  the checks. The app never claims a result is safe or certified.
- **Local export:** the treatment plan downloads as Markdown from the browser. Untrusted text is fenced, control and
  bidirectional characters are stripped, and the full intake is excluded unless you opt in.

## How live mode is protected

| Concern | Approach |
| --- | --- |
| Bots | Cloudflare Turnstile, verified server-side for action, hostname and session binding, fresh token per step |
| Spend | Atomic Redis (Lua) budgets: per IP, per session, global calls, and global **tokens** per minute/day/month |
| Races | One call per case stage; duplicate or replayed requests lose an atomic state transition and never reach the model |
| Concurrency | Expiring leases with owner tokens (2 global, 1 per session) |
| Integrity | HMAC-signed ticket binds the case, session, intake and questions between the two steps; Redis state must also agree |
| Failure | Redis, challenge or provider trouble means no model call; one attempt, no hidden retry, no fallback model |
| Output | Zod schemas, evidence validation, heuristic checks for secret requests, scan or certification claims, and unsafe advice |
| Privacy | No case text or reports stored server-side; logs hold only IDs, stage, outcome, latency and token totals |

Tests describe these properties (see below). They are evidence, not a security certification.

## Stack

Next.js (App Router) · TypeScript · Tailwind · shadcn/ui · Zod · Groq · Upstash Redis · Cloudflare Turnstile ·
Vitest · Playwright

## Getting started

Requires Node 24 (see `.nvmrc`; `nvm use` picks it up) and npm 11.

```bash
npm install
cp .env.example .env.local   # then fill in values; never commit .env.local
npm run dev
```

With `LIVE_AI_ENABLED=false` (the default) only the samples run. To try live mode locally you need a Groq key, an
Upstash Redis database, and a Turnstile widget whose hostname includes `localhost`. Generate each HMAC secret
independently with at least 32 random bytes. Live mode refuses to start if a secret is missing, short, duplicated, or
if Turnstile test keys are used on an https origin.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm test` | Unit tests with a mock Redis that runs the real Lua scripts |
| `npm run test:redis` | Gate and budget suites against a real Upstash database (unique key prefix, cleaned up) |
| `npm run e2e` | Playwright against a production build (`npm run build` first); live endpoints are mocked |
| `npm run scan:bundle` | After `npm run build`: fails if browser-visible output contains a server secret |
| `npm run verify:deploy -- <url>` | Checks a deployed site against the launch gates (see `DEPLOY.md`) |
| `npm run notices` | Regenerates `THIRD_PARTY_NOTICES.md` |
| `npm run eval` | Intentional, quota-spending evaluation on 18 fictional cases; see `eval/` |
| `npm run typecheck` / `npm run lint` | Static checks |

## Evaluation

The quality card on the site shows measured results only, versioned to the prompt and fixtures they were measured
with, or "Evaluation pending". Fake-provider tests are never counted as model quality.

## Limits worth knowing

- The assessment is only as good as the text you give it, and the model can be wrong.
- Shared networks can hit per-IP limits; samples remain available.
- A single-run evaluation shows what happened, not how consistent the model is.

## Deploying

See [`DEPLOY.md`](DEPLOY.md) for the staged plan, the environment variables, the kill-switch, and what only you can verify.

## License

Source code is MIT (see `LICENSE`). The website terms and privacy notice are separate and live at `/terms` and
`/privacy`. Report vulnerabilities per `SECURITY.md`.

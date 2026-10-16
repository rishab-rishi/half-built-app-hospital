# Task: write the placeholder failure playbook

You are writing reference data for a retrieval (RAG) feature in this app. Do not write or change any code. Your only
output is one JSON file:

    src/data/playbook/entries.json

## Background (read this, then stop exploring)

The app takes a user's description of a broken app (title, stack, symptoms, error text) and asks a model for a
provisional diagnosis. A retrieval step will soon pick the 2–3 playbook *sections* that best match the user's text and
add them to the prompt as reference material. The model may cite them in hypotheses and recovery tasks. They are shown
to users as "Reference", next to what the user wrote.

So each section must:

- stand on its own, because it will be shown without the rest of the entry,
- be short, because every character counts against a tight token budget,
- be safe to repeat word for word, because the model may echo it.

You don't need to read the rest of the repo. In particular, **do not open `eval/fixtures.ts` or
`src/data/sample-cases.ts`**. The playbook is judged against those cases, and entries written from them would make the
evaluation meaningless. Write general patterns from your own knowledge.

## File format

A JSON array of entries. No comments and no trailing commas. Every field is required.

```json
[
  {
    "id": "env-var-missing-in-deploy",
    "title": "Configuration value missing after deployment but present locally",
    "stacks": ["any"],
    "signals": [
      "works locally but not in production",
      "undefined in production",
      "environment variable",
      "missing config after deploy",
      "only fails on the deployed site"
    ],
    "sections": {
      "cause": "A setting the app reads from the environment exists in the developer's local configuration but was never added to the hosting platform, or was added under a different name or only for some environments. Some frameworks also bake values into the build, so a value added after the build is not picked up.",
      "confirm": "Compare the list of setting names the code reads with the names configured for the deployed environment, without exposing their values. Check whether the failing code runs in the browser or on the server, and whether the setting was added before or after the latest build.",
      "fix": "Add the missing setting for every environment that needs it, rebuild and redeploy, and make the app fail at startup with a clear message naming any required setting that is absent. Confirm in staging that the affected feature works after a fresh deploy.",
      "notWhen": "If the deployed environment has the setting with the right name and the failure persists after a fresh build, or the error names a network or permission problem, look for a different cause."
    }
  }
]
```

### Field rules

| Field | Rule |
| --- | --- |
| `id` | Unique, lowercase kebab-case, 3–40 characters, `a-z0-9-` only. Never changes once written. |
| `title` | 10–100 characters. Describes the failure, not the fix. |
| `stacks` | 1–6 lowercase technology names the pattern applies to (`react`, `next.js`, `postgresql`, `stripe`...). Use `"any"` alone for stack-independent patterns. |
| `signals` | 3–8 phrases, each 3–80 characters: things a user would actually type or paste. Include exact error fragments, status codes, and plain-English symptoms ("works locally but not in production"). These drive keyword matching, so use the words users use, not textbook terms. |
| `sections.cause` | 120–400 characters. Why it happens. |
| `sections.confirm` | 120–400 characters. Observations that would confirm or rule it out, run in staging or locally. |
| `sections.fix` | 120–400 characters. The direction of the fix, plus how to check it worked. |
| `sections.notWhen` | 80–300 characters. Evidence that points away from this pattern. This keeps the model from forcing a match. |

## Content rules

The app has a safety filter that rejects model output containing any of the following. Sections can be echoed into
that output, so **none of these may appear anywhere in the file**:

- URLs, or anything starting with `http`
- HTML or angle-bracket tags, `javascript:`, `data:`
- shell commands or code blocks: describe actions in words ("clear the build cache"), never as commands
- destructive wording: `rm -rf`, `drop table`, `drop database`, `truncate table`, `delete from`, `chmod 777`, piping
  into `sh` or `bash`, `--no-verify`, `force push`, or "disable" followed by authentication, authorization, CSRF, SSL,
  TLS or certificate checks
- requests for secrets: never tell the reader to send, paste, share or provide a password, API key, token,
  credentials, `.env` file or connection string
- claims of inspection: "we tested", "I reviewed your code", "scan results show"
- guarantees: "production-ready", "safe to deploy", "guaranteed fix", "no vulnerabilities", "certified secure"

Also:

- **Plain sentences only.** No Markdown, lists or line breaks inside a string.
- **Hedge.** Say "usually", "often", "one common cause". Each entry is a pattern, not a verdict.
- **Avoid figures that go stale.** Don't quote specific platform limits, prices or version numbers ("the host's request
  body size limit", not a number), unless the fact has been stable for years (for example, HTTP status meanings).
- **No vendor promotion.** Name a tool only when the pattern is specific to it.
- **Write in your own words.** Don't copy text from documentation or other sources.
- **Security-related entries** (authorization, sessions, tokens, payments, cross-user data) must say in `fix` that an
  engineer should verify the change, and must not imply the issue is resolved once the fix is applied.
- **Testing in production.** Never recommend it. Verification happens in staging or locally.

## Which entries to write

Write **16 entries**: one for each topic below. Keep each entry general enough to apply beyond one specific app.

1. Form submit reloads the page in a single-page app (default browser submit not prevented)
2. Server crash on missing or empty input in a request handler
3. Upload or request rejected for size: 413 from the host, proxy or framework body limit
4. Login or cookies failing in one browser only (third-party cookie and SameSite rules, Safari tracking prevention)
5. Users see stale data after a write (caching layer, CDN or framework cache not invalidated)
6. Dates off by one day (UTC vs local time, date-only strings parsed as midnight UTC)
7. Scheduled job not running or running at the wrong time (cron time zone, serverless platform cron limits, the job
   process not running)
8. Client state lost on refresh (state kept only in memory, storage not written or not read back on load)
9. Cloud storage upload denied (identity policy vs bucket policy vs object ownership or encryption settings, wrong
   region or account)
10. Database connections failing intermittently in production (connection pool exhaustion, serverless connection
    churn, idle timeouts)
11. One user can see another user's records (missing ownership check on lookups by ID)
12. Password reset or magic links reusable or never expiring (tokens not marked used, no expiry check)
13. Payment or webhook events processed twice (no idempotency key, retries, out-of-order delivery)
14. Transactional emails not arriving (unverified sender domain, missing SPF/DKIM records, provider sandbox mode,
    errors swallowed)
15. Totals wrong after filtering by date (inclusive vs exclusive end date, time-zone boundaries, filter applied after
    aggregation)
16. Slow first request after idle on serverless hosting (cold starts, heavy initialisation at startup, region far from
    the database)

## Before you finish, check

- [ ] The file parses as JSON and is a single array of 16 objects.
- [ ] Every `id` is unique and matches the id rules.
- [ ] Every field is present and within its character range. Count, don't estimate.
- [ ] A case-insensitive search of the whole file finds none of the banned items in **Content rules**.
- [ ] No string contains a line break.
- [ ] You changed no file other than `src/data/playbook/entries.json`.

When done, report the file path, the number of entries, and any topic you found hard to fit inside the limits.

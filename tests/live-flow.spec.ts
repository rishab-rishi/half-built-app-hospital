import { expect, test, type Page, type Route } from "@playwright/test";
import { sampleCases } from "../src/data/sample-cases";
import { buildEvidenceMap, validateEvidence } from "../src/lib/evidence";

const sample = sampleCases[0];
const CASE_ID = "A".repeat(22);
const CDATA = "c".repeat(64);
const report = validateEvidence(sample.report, buildEvidenceMap(sample.intake, sample.answers)).report;

type Call = { path: string; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

const json = (route: Route, status: number, body: unknown, headers: Record<string, string> = {}) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body), headers });

/** Fake Turnstile: hands out a token named after the action, like the real widget would per challenge. */
async function mockTurnstile(page: Page) {
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.turnstile = {
        render(el, o) {
          el.setAttribute("data-action", o.action);
          // Strict like the real widget: only the documented cData option counts. A lowercase cdata is ignored.
          el.setAttribute("data-cdata", o.cData || "");
          if (o.cdata) el.setAttribute("data-ignored-lowercase-cdata", o.cdata);
          setTimeout(() => o.callback("tok-" + o.action), 30);
          return "w" + Math.random();
        },
        remove() {}
      };`,
    }),
  );
}

async function mockLive(page: Page, overrides: Partial<Record<"session" | "triage" | "diagnose", (r: Route) => Promise<void>>> = {}) {
  const calls: Call[] = [];
  await mockTurnstile(page);
  await page.route("**/api/status", (r) => json(r, 200, { mode: "live", termsVersion: "2026-10-09", privacyVersion: "2026-10-09" }));
  const handler = (name: "session" | "triage" | "diagnose", ok: unknown) => async (route: Route) => {
    calls.push({ path: `/api/${name}`, body: route.request().postDataJSON() });
    if (overrides[name]) return overrides[name]!(route);
    return json(route, 200, ok);
  };
  await page.route("**/api/session", handler("session", { caseId: CASE_ID, cdata: CDATA }));
  await page.route("**/api/triage", handler("triage", { questions: sample.questions, ticket: "ticket-value" }));
  await page.route("**/api/diagnose", handler("diagnose", { report }));
  return calls;
}

async function fillForm(page: Page) {
  await page.getByLabel("App title").fill(sample.intake.title);
  await page.getByLabel("What is the app meant to do?").fill(sample.intake.purpose);
  await page.getByLabel("Technology stack (comma separated)").fill(sample.intake.stack.join(", "));
  await page.getByLabel("What works today? (one per line)").fill(sample.intake.working.join("\n"));
  await page.getByLabel("What fails or looks wrong?").fill(sample.intake.symptoms);
  await page.getByLabel("Redacted error excerpt (optional)").fill(sample.intake.error ?? "");
}

const admit = (page: Page) => page.getByRole("button", { name: "Admit my app" });

test("full live journey with fresh challenges and a clearly live report", async ({ page }) => {
  const calls = await mockLive(page);
  await page.goto("/admission");
  await expect(page.getByRole("note").filter({ hasText: "Submit only information you own" })).toBeVisible();

  // Button needs both consent and a completed challenge.
  await fillForm(page);
  await expect(admit(page)).toBeDisabled();
  await page.getByLabel(/I agree to the/).check();
  await expect(admit(page)).toBeEnabled();
  await admit(page).click();

  // Triage: needs its own fresh challenge, bound to the session.
  await expect(page.getByRole("heading", { name: "Triage" })).toBeVisible();
  await expect(page.locator('[data-action="triage"]')).toHaveAttribute("data-cdata", CDATA);
  await page.getByRole("button", { name: "Get clarifying questions" }).click();

  await expect(page.getByRole("heading", { name: "A few clarifying questions" })).toBeVisible();
  await page.getByLabel(sample.questions[0].text).fill("Timeout at step 3");
  await page.getByRole("button", { name: "I don't know" }).nth(1).click();
  await expect(page.locator('[data-action="diagnose"]')).toHaveAttribute("data-cdata", CDATA);
  await page.getByRole("button", { name: "Create treatment plan" }).click();

  // Report is labelled live, never as a sample.
  await expect(page.getByText("Provisional AI assessment of the details you supplied")).toBeVisible();
  await expect(page.getByText("Fictional sample")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear case" })).toBeVisible();

  // Each protected step carried its own action-specific token; case text only went where it must.
  expect(calls.map((c) => c.path)).toEqual(["/api/session", "/api/triage", "/api/diagnose"]);
  expect(calls[0].body.turnstileToken).toBe("tok-admission");
  expect(calls[0].body.terms).toEqual({ accepted: true, termsVersion: "2026-10-09", privacyVersion: "2026-10-09" });
  expect(JSON.stringify(calls[0].body)).not.toContain(sample.intake.symptoms);
  expect(calls[1].body.turnstileToken).toBe("tok-triage");
  expect(calls[1].body.intake.symptoms).toBe(sample.intake.symptoms);
  expect(calls[2].body.turnstileToken).toBe("tok-diagnose");
  expect(calls[2].body.ticket).toBe("ticket-value");
  expect(calls[2].body.answers).toEqual([
    { questionId: "q1", text: "Timeout at step 3" },
    { questionId: "q2", text: "I don't know" },
  ]);

  // Evidence panel shows the visitor's own supplied text, with no sample label.
  await page.getByRole("button", { name: /View evidence/ }).first().click();
  const panel = page.getByRole("region", { name: "Why this finding?" });
  await expect(panel).toBeVisible();
  await expect(panel).not.toContainText("Fictional sample");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  // Clear case wipes everything back to an empty form.
  await page.getByRole("button", { name: "Clear case" }).click();
  await expect(page.getByLabel("App title")).toHaveValue("");
  await expect(page.getByLabel(/I agree to the/)).not.toBeChecked();
});

test("validation errors stop the request and keep the visitor's text", async ({ page }) => {
  const calls = await mockLive(page);
  await page.goto("/admission");
  await page.getByLabel("App title").fill("Only a title");
  await page.getByLabel(/I agree to the/).check();
  await admit(page).click();
  await expect(page.getByText("This field is required.").first()).toBeVisible();
  expect(calls).toHaveLength(0);
  await expect(page.getByLabel("App title")).toHaveValue("Only a title");
});

test("a rate limit shows a wait time, keeps the case, and never retries by itself", async ({ page }) => {
  const calls = await mockLive(page, {
    triage: (r) => json(r, 429, { error: "rate_limited", retryAfterSec: 30, requestId: "r1" }, { "retry-after": "30" }),
  });
  await page.goto("/admission");
  await fillForm(page);
  await page.getByLabel(/I agree to the/).check();
  await admit(page).click();
  await page.getByRole("button", { name: "Get clarifying questions" }).click();

  const alert = page.getByTestId("failure-alert");
  await expect(alert).toContainText("about 30 seconds");
  await expect(alert.getByRole("link", { name: "Explore a sample patient" })).toBeVisible();
  await expect(alert).toBeFocused();
  await page.waitForTimeout(1200);
  expect(calls.filter((c) => c.path === "/api/triage")).toHaveLength(1);

  // The visitor may deliberately try again; that uses a fresh challenge (the widget was remounted).
  await expect(page.getByRole("button", { name: "Get clarifying questions" })).toBeEnabled();
});

test("a consumed stage offers a fresh start and samples, not a retry", async ({ page }) => {
  await mockLive(page, { triage: (r) => json(r, 502, { error: "invalid_result", requestId: "r2" }) });
  await page.goto("/admission");
  await fillForm(page);
  await page.getByLabel(/I agree to the/).check();
  await admit(page).click();
  await page.getByRole("button", { name: "Get clarifying questions" }).click();
  const alert = page.getByTestId("failure-alert");
  await expect(alert).toContainText("safety checks");
  await expect(alert.getByRole("button", { name: "Start a new case" })).toBeVisible();
});

test("a credential warning from the server is shown and the form text is kept", async ({ page }) => {
  await mockLive(page, { session: (r) => json(r, 400, { error: "secret_detected" }) });
  await page.goto("/admission");
  await fillForm(page);
  await page.getByLabel(/I agree to the/).check();
  await admit(page).click();
  await expect(page.getByTestId("failure-alert")).toContainText("looks like a password");
  await expect(page.getByLabel("App title")).toHaveValue(sample.intake.title);
});

test("sample mode: no form, no live calls, samples one click away", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.match(/^\/api\/(session|triage|diagnose)/)) calls.push(r.url());
  });
  await page.route("**/api/status", (r) => json(r, 200, { mode: "sample" }));
  await page.goto("/admission");
  await expect(page.getByRole("heading", { level: 1, name: "Live admissions are paused." })).toBeVisible();
  await expect(page.getByLabel("App title")).toHaveCount(0);
  await page.getByRole("link", { name: "Explore a sample chart" }).click();
  await expect(page).toHaveURL("/#samples");
  expect(calls).toEqual([]);
});

test("a failed status check never blocks the samples", async ({ page }) => {
  await page.route("**/api/status", (r) => r.abort());
  await page.goto("/admission");
  await expect(page.getByRole("heading", { level: 1, name: "Live admissions are paused." })).toBeVisible();
  await page.goto("/chart/saas-portal-access");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("SaaS Portal");
});

test("the policy pages the consent checkbox links to exist", async ({ page }) => {
  for (const [path, heading] of [
    ["/terms", "Terms"],
    ["/privacy", "Privacy Notice"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

/* ---------- Remember in this tab ---------- */

async function completeFlow(page: Page) {
  await page.goto("/admission");
  await fillForm(page);
  await page.getByLabel(/I agree to the/).check();
  await admit(page).click();
  await page.getByRole("button", { name: "Get clarifying questions" }).click();
  await page.getByRole("button", { name: "Create treatment plan" }).click();
  await expect(page.getByText("Provisional AI assessment of the details you supplied")).toBeVisible();
}
const savedKey = (page: Page) => page.evaluate(() => sessionStorage.getItem("hh:saved-case:v1"));

test("nothing is stored unless the visitor opts in", async ({ page }) => {
  await mockLive(page);
  await completeFlow(page);
  expect(await savedKey(page)).toBeNull();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Saved case" })).toHaveCount(0);
});

test("opting in keeps the case and checklist progress across a reload; Clear case removes it", async ({ page }) => {
  await mockLive(page);
  await completeFlow(page);
  await page.getByLabel(/Keep this case/).check();
  const stored = JSON.parse((await savedKey(page))!);
  expect(Object.keys(stored)).not.toContain("ticket");
  expect(JSON.stringify(stored)).not.toContain("tok-");
  expect(JSON.stringify(stored)).not.toContain("ticket-value");

  // Progress made after opting in is saved too.
  const card = page.locator("li", { hasText: "Reproduce the race condition" }).first();
  await card.getByRole("button", { name: "In progress" }).click();

  await page.reload();
  const banner = page.getByRole("region", { name: "Saved case" });
  await expect(banner).toContainText(sample.intake.title);
  await expect(banner).toContainText("not re-checked");
  await page.getByRole("button", { name: "Restore saved case" }).click();
  await expect(page.getByText("Provisional AI assessment of the details you supplied")).toBeVisible();
  await expect(page.getByLabel(/Keep this case/)).toBeChecked();
  await expect(
    page.locator("li", { hasText: "Reproduce the race condition" }).first().getByRole("button", { name: "In progress" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Clear case" }).click();
  expect(await savedKey(page)).toBeNull();
  await page.reload();
  await expect(page.getByRole("region", { name: "Saved case" })).toHaveCount(0);
});

test("turning it off, or deleting the saved case, removes it", async ({ page }) => {
  await mockLive(page);
  await completeFlow(page);
  await page.getByLabel(/Keep this case/).check();
  expect(await savedKey(page)).not.toBeNull();
  await page.getByLabel(/Keep this case/).uncheck();
  expect(await savedKey(page)).toBeNull();

  await page.getByLabel(/Keep this case/).check();
  await page.reload();
  await page.getByRole("button", { name: "Delete saved case" }).click();
  expect(await savedKey(page)).toBeNull();
  await expect(page.getByRole("region", { name: "Saved case" })).toHaveCount(0);
});

test("tampered or malformed storage is ignored and deleted", async ({ page }) => {
  await mockLive(page);
  await page.goto("/admission");
  await page.evaluate(() => sessionStorage.setItem("hh:saved-case:v1", JSON.stringify({ v: 1, intake: { title: "<img src=x onerror=alert(1)>" } })));
  await page.reload();
  await expect(page.getByRole("region", { name: "Saved case" })).toHaveCount(0);
  expect(await savedKey(page)).toBeNull();
});

test("the page still works when session storage is blocked", async ({ page }) => {
  await mockLive(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
  });
  await completeFlow(page);
  await page.getByLabel(/Keep this case/).check(); // must not crash
  await expect(page.getByText("Provisional AI assessment of the details you supplied")).toBeVisible();
});

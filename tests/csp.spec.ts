import { expect, test, type Page } from "@playwright/test";

// These run against a server started with CSP_MODE=enforce, so a blocked script is a real failure.

async function watchViolations(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} -> ${e.blockedURI}`),
    );
  });
  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  return {
    violations: () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp),
    consoleErrors,
  };
}

test("pages send an enforcing policy with a fresh nonce on every request", async ({ request }) => {
  const nonces = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const res = await request.get("/");
    const csp = res.headers()["content-security-policy"];
    expect(csp, "enforcing header").toBeTruthy();
    expect(res.headers()["content-security-policy-report-only"]).toBeUndefined();
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    nonces.add(nonce!);
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).not.toContain("unsafe-inline");
    expect(script).not.toContain("unsafe-eval");
  }
  expect(nonces.size).toBe(3);
});

for (const path of ["/", "/chart/booking-double-reservations", "/admission", "/terms", "/privacy", "/limitations", "/security", "/missing"]) {
  test(`no policy violations or console errors on ${path}`, async ({ page }) => {
    const watch = await watchViolations(page);
    await page.route("**/api/status", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ mode: "sample" }) }));
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await watch.violations()).toEqual([]);
    // The browser logs the 404 status of the page itself; that is not a policy or script problem.
    const errors = watch.consoleErrors.filter((e) => !(path === "/missing" && e.includes("status of 404")));
    expect(errors).toEqual([]);
  });
}

test("the page still hydrates: interactive controls work under the policy", async ({ page }) => {
  const watch = await watchViolations(page);
  await page.goto("/chart/booking-double-reservations");
  const card = page.locator("li", { hasText: "Reproduce the race condition" }).first();
  const inProgress = card.getByRole("button", { name: "In progress" });
  await inProgress.click();
  await expect(inProgress).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /View evidence/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await watch.violations()).toEqual([]);
});

test("Turnstile can load and render under the policy", async ({ page }) => {
  const watch = await watchViolations(page);
  await page.route("**/api/status", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ mode: "live", termsVersion: "2026-10-09", privacyVersion: "2026-10-09" }) }),
  );
  // Stand-in for Cloudflare's script: it is fetched from the real origin, so the policy decides whether it may run.
  await page.route("https://challenges.cloudflare.com/**", (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body: `window.turnstile={render(el,o){setTimeout(()=>o.callback("tok-"+o.action),20);return"w"},remove(){}};`,
    }),
  );
  await page.goto("/admission");
  await page.getByLabel(/I agree to the/).check();
  await page.getByLabel("App title").fill("t");
  await expect(page.getByRole("button", { name: "Admit my app" })).toBeEnabled(); // enabled only after the widget's callback ran
  expect(await watch.violations()).toEqual([]);
});

test("an inline script injected into the HTML without the nonce does not run", async ({ page }) => {
  // Simulates an XSS hole: a parser-inserted <script> that did not come from our server render.
  await page.route("**/terms", async (route) => {
    const res = await route.fetch();
    const html = (await res.text()).replace("</body>", "<script>window.__pwn = true</script></body>");
    await route.fulfill({ response: res, body: html });
  });
  const watch = await watchViolations(page);
  await page.goto("/terms");
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => (window as unknown as { __pwn?: boolean }).__pwn)).toBeUndefined();
  expect((await watch.violations()).some((v) => v.startsWith("script-src") && v.endsWith("inline"))).toBe(true);
});

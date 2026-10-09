import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PAGES = ["/", "/chart/booking-double-reservations", "/chart/saas-portal-access", "/admission", "/terms", "/privacy", "/limitations", "/security", "/nope"];

async function violations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe, ${scheme} scheme`, () => {
    test.use({ colorScheme: scheme });

    for (const path of PAGES) {
      test(`no WCAG A/AA violations on ${path}`, async ({ page }) => {
        await page.goto(path);
        expect(await violations(page)).toEqual([]);
      });
    }

    test("evidence drawer and expanded checklist", async ({ page }) => {
      await page.goto("/chart/booking-double-reservations");
      await page.locator("summary").first().click();
      await page.getByRole("button", { name: /View evidence/ }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}

test("the live form and its error state have no violations", async ({ page }) => {
  await page.route("**/api/status", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ mode: "live", termsVersion: "2026-10-09", privacyVersion: "2026-10-09" }) }),
  );
  await page.route("https://challenges.cloudflare.com/**", (r) =>
    r.fulfill({ contentType: "application/javascript", body: "window.turnstile={render(){return 'w'},remove(){}};" }),
  );
  await page.goto("/admission");
  await expect(page.getByLabel("App title")).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await page.getByLabel(/I agree to the/).check();
  await page.getByLabel("App title").fill("x");
  await page.getByRole("button", { name: "Admit my app" }).click({ force: true });
  expect(await violations(page)).toEqual([]);
});

test("reduced motion is respected", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/chart/booking-double-reservations");
  const animated = await page.evaluate(() =>
    [...document.querySelectorAll("*")].filter((el) => {
      const s = getComputedStyle(el);
      return (parseFloat(s.animationDuration) > 0.01 && s.animationName !== "none") || parseFloat(s.transitionDuration) > 0.01;
    }).length,
  );
  expect(animated).toBe(0);
});

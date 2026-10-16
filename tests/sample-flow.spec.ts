import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("sample journey works with live AI disabled and makes no API calls", async ({ page }) => {
  const apiCalls: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) apiCalls.push(r.url());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What this demo can prove" })).toBeVisible();
  await page.getByRole("link", { name: /Open patient chart.*Booking App/ }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Booking App");
  await expect(page.getByRole("note").filter({ hasText: "Fictional sample" })).toBeVisible();

  // Evidence opens inline beside its finding: by keyboard, showing supplied text, closed with Escape, focus kept.
  // A stable locator: the button renames itself "Hide evidence" once open.
  const trigger = page.locator("#observations").getByRole("button", { name: /evidence/ }).first();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const panel = page.getByRole("region", { name: "Why this finding?" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Fictional sample");
  await expect(panel).toContainText("has not been independently verified");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  // Verified is blocked until criteria are checked and confirmed.
  const card = page.locator("li", { hasText: "Reproduce the race condition" }).first();
  await card.getByRole("button", { name: "Verified by you" }).click();
  await expect(card.getByRole("alert")).toContainText("Check every criterion");

  await card.locator("summary").click();
  await expect(card.locator("fieldset")).toContainText("Fictional sample - not an assessment of your app.");
  const boxes = card.locator("fieldset input[type=checkbox]");
  const n = await boxes.count();
  for (let i = 0; i < n - 1; i++) await boxes.nth(i).check();
  await card.getByRole("button", { name: "Verified by you" }).click();
  await expect(card.getByRole("alert")).toContainText("I performed these checks");

  await card.getByLabel("I performed these checks").check();
  await card.getByRole("button", { name: "Verified by you" }).click();
  await expect(page.getByTestId("progress")).toContainText("1 of");
  await expect(card.getByRole("button", { name: "Verified by you" })).toHaveAttribute("aria-pressed", "true");

  // Export: default omits the full intake and labels the sample.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download treatment plan (.md)" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("hospital-treatment-plan.md");
  const text = readFileSync((await download.path())!, "utf8");
  expect(text).toContain("Fictional sample - not an assessment of your app");
  expect(text).toContain("User-marked verified");
  expect(text).not.toContain("Full intake");

  // Reset clears local state.
  await page.getByRole("button", { name: "Reset this sample" }).click();
  await expect(page.getByTestId("progress")).toContainText("0 of");

  expect(apiCalls).toEqual([]);
});

test("script-like text renders inert and admission shows sample fallback", async ({ page }) => {
  await page.goto("/admission");
  await expect(page.getByRole("heading", { level: 1, name: "Live admissions are paused." })).toBeVisible();
  await page.getByRole("link", { name: "Explore a sample chart" }).click();
  await expect(page).toHaveURL("/#samples");
});

test("no horizontal scroll on a chart page", async ({ page }) => {
  await page.goto("/chart/saas-portal-access");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test("live endpoints are switched off by default and say so safely", async ({ request }) => {
  for (const path of ["/api/session", "/api/triage", "/api/diagnose"]) {
    const res = await request.post(path, {
      headers: { origin: "http://localhost:3100" },
      data: {},
    });
    expect(res.status()).toBe(503);
    expect(res.headers()["cache-control"]).toBe("no-store");
    const body = await res.json();
    expect(body.error).toBe("live_disabled");
    expect(JSON.stringify(body)).not.toMatch(/redis|groq|secret|stack/i);
  }
  const get = await request.get("/api/session");
  expect(get.status()).toBe(405);
});

test("pages carry the baseline security headers", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("no-referrer");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
});

test("the quality card shows the measured, versioned evaluation including misses", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("region", { name: "What this demo can prove" });
  // The scope statement is always visible; the measured results (misses included) sit in a labelled disclosure.
  await expect(card).toContainText("no repository inspection, code execution, or security certification");
  await card.getByText("How this was measured, including what was not met").click();
  await expect(card).toContainText("Measured 2026-10-16 on 18 fictional cases");
  await expect(card).toContainText("not met:");
  await expect(card).toContainText("tuned using these same 18 cases");
  await expect(card).not.toContainText("Evaluation pending");
  await expect(card).not.toContainText("Out of date");
});

test("browsing the samples sets no cookie and the privacy notice lists what is stored", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Open patient chart.*Booking App/ }).click();
  await page.getByRole("button", { name: /View evidence/ }).first().click();
  await page.locator("summary").first().click();
  await page.goto("/admission");
  // The claim on the privacy page: no cookie until a live assessment starts.
  expect(await context.cookies()).toEqual([]);

  await page.goto("/privacy");
  const section = page.locator("article");
  await expect(page.getByRole("heading", { name: "Cookies and browser storage" })).toBeVisible();
  await expect(section).toContainText("__Host-hospital-session");
  await expect(section).toContainText("hh:saved-case:v1");
  await expect(section).toContainText("no analytics, advertising or tracking cookies");
});

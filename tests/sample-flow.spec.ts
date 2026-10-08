import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("sample journey works with live AI disabled and makes no API calls", async ({ page }) => {
  const apiCalls: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) apiCalls.push(r.url());
  });

  await page.goto("/");
  await expect(page.getByText("Evaluation pending")).toBeVisible();
  await page.getByRole("link", { name: /Open chart for The Booking App/ }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Booking App");
  await expect(page.getByRole("note").filter({ hasText: "Fictional sample" })).toBeVisible();

  // Evidence drawer: opens by click, shows supplied text, closes with Escape, restores focus.
  const trigger = page.getByRole("button", { name: /View evidence/ }).first();
  await trigger.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog");
  await expect(drawer).toContainText("Why this finding?");
  await expect(drawer).toContainText("Fictional sample");
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();

  // Verified is blocked until criteria are checked and confirmed.
  const card = page.locator("li", { hasText: "Reproduce the race condition" }).first();
  await card.getByRole("button", { name: "Verified", exact: true }).click();
  await expect(card.getByRole("alert")).toContainText("Check every criterion");

  await card.locator("summary").click();
  const boxes = card.locator("fieldset input[type=checkbox]");
  const n = await boxes.count();
  for (let i = 0; i < n - 1; i++) await boxes.nth(i).check();
  await card.getByRole("button", { name: "Verified", exact: true }).click();
  await expect(card.getByRole("alert")).toContainText("I performed these checks");

  await card.getByLabel("I performed these checks").check();
  await card.getByRole("button", { name: "Verified", exact: true }).click();
  await expect(page.getByTestId("progress")).toContainText("1 of");
  await expect(page.getByRole("region", { name: "Verified (by you)" })).toContainText("Reproduce the race");

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
  await expect(page.getByText("The hospital is busy")).toBeVisible();
  await page.getByRole("link", { name: "Explore a sample patient" }).click();
  await expect(page).toHaveURL("/");
});

test("no horizontal scroll on a chart page", async ({ page }) => {
  await page.goto("/chart/saas-portal-access");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

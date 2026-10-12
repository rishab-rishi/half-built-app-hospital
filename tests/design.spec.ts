import { expect, test, type Page } from "@playwright/test";

// The redesign's measurable promises. Viewport sizes are set explicitly, so this runs in the desktop project only.
test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "sets its own viewports");
});

const SIZES = [
  { name: "375px", width: 375, height: 812 },
  { name: "768px", width: 768, height: 1024 },
  { name: "1440px", width: 1440, height: 900 },
];
const PAGES = ["/", "/admission", "/chart/booking-double-reservations", "/chart/storefront-payment-state", "/chart/saas-portal-access", "/terms", "/limitations"];

async function overflowsHorizontally(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
}

test.describe("home page", () => {
  test("hero, availability and the three sample patients reflect live admissions being off", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveText(/Half-built\.\s*Still full of possibility\./);
    // "full of possibility" is the restrained italic emphasis, in the rust accent.
    const em = h1.locator("em");
    await expect(em).toHaveText("full of possibility.");
    expect(await em.evaluate((e) => getComputedStyle(e).fontStyle)).toBe("italic");
    expect(await em.evaluate((e) => getComputedStyle(e).color)).toBe("rgb(164, 66, 36)");
    const size = await h1.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(size).toBeGreaterThanOrEqual(72);
    expect(size).toBeLessThanOrEqual(88);

    // Live is off, so the main action is the sample chart and the status says so.
    const hero = page.getByRole("region", { name: /Half-built/ });
    await expect(hero.getByRole("link", { name: "Explore a sample chart" })).toHaveAttribute("href", "/#samples");
    await expect(hero.getByRole("link", { name: "Check admissions" })).toHaveAttribute("href", "/admission");
    await expect(hero.getByRole("link", { name: "Admit your app" })).toHaveCount(0);
    await expect(hero).toContainText("Live admissions paused · Sample charts are open");

    // The folder preview is built from the booking sample and labelled as fictional.
    const folder = hero.getByRole("figure");
    await expect(folder).toContainText("Fictional sample");
    await expect(folder).toContainText("The Booking App With Double Reservations");
    await expect(folder).toContainText("Provisional hypothesis · not confirmed");
    await expect(folder.getByRole("listitem")).toHaveCount(2);

    // Three-part strip.
    const strip = page.getByRole("region", { name: "What you get" });
    await expect(strip.getByRole("listitem")).toHaveText([
      "Based on your description",
      "Clear steps to verify",
      "A plan you can take with you",
    ]);

    // Sample patients keep their identities and routes.
    const cards = page.getByRole("region", { name: "Meet three fictional patients" }).getByRole("listitem");
    await expect(cards).toHaveCount(3);
    for (const [i, [headline, name, id]] of [
      ["The double reservation", "The Booking App With Double Reservations", "booking-double-reservations"],
      ["The uncertain payment", "The Storefront With Uncertain Payment State", "storefront-payment-state"],
      ["The crossed boundaries", "The SaaS Portal With Confusing Access", "saas-portal-access"],
    ].entries()) {
      const card = cards.nth(i);
      await expect(card).toContainText(headline);
      await expect(card).toContainText(name);
      await expect(card).toContainText("Fictional");
      await expect(card.getByRole("link", { name: /Open patient chart/ })).toHaveAttribute("href", `/chart/${id}`);
    }

    // Steps, limitations, policy links.
    await expect(page.getByRole("region", { name: "Describe, understand, verify" }).getByRole("listitem")).toHaveCount(3);
    await expect(page.getByRole("region", { name: "What this can't do" })).toBeVisible();
    for (const name of ["Terms", "Privacy", "Limitations", "Security"]) {
      await expect(page.getByRole("navigation", { name: "Policies" }).getByRole("link", { name })).toBeVisible();
    }
  });

  test("header navigation reaches the sections", async ({ page }) => {
    await page.goto("/limitations");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Half-Built App Hospital" })).toBeVisible();
    await nav.getByRole("link", { name: "How it works" }).click();
    await expect(page).toHaveURL("/#how-it-works");
    await expect(page.getByRole("heading", { name: "Describe, understand, verify" })).toBeInViewport();
  });

  test("the evaluation is an expandable section that keeps the misses discoverable", async ({ page }) => {
    await page.goto("/");
    const details = page.locator("details", { hasText: "How this was measured" }).first();
    await expect(details).not.toHaveAttribute("open", "");
    await details.locator("summary").click();
    await expect(details).toContainText("Measured 2026-10-09 on 18 fictional cases");
    await expect(details).toContainText("not met:");
    await expect(details).toContainText("Known limitations");
  });

  test("on a phone the main action comes before the chart preview", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const action = await page.getByRole("link", { name: "Explore a sample chart" }).first().boundingBox();
    const folder = await page.getByRole("figure").boundingBox();
    expect(action!.y).toBeLessThan(folder!.y);
    // Sample cards stack into a single column.
    const cards = page.getByRole("region", { name: "Meet three fictional patients" }).getByRole("listitem");
    const a = await cards.nth(0).boundingBox();
    const b = await cards.nth(1).boundingBox();
    expect(Math.abs(a!.x - b!.x)).toBeLessThan(2);
    expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1);
  });
});

test.describe("chart page", () => {
  test("lead with the diagnosis, then evidence and the plan, with section navigation", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/chart/saas-portal-access");
    await expect(page.getByRole("note").filter({ hasText: "Fictional sample - not an assessment of your app." })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("SaaS Portal");
    await expect(page.getByRole("button", { name: "Download plan (.md)" })).toBeVisible();

    const order = await page.locator("main section h2").allTextContents();
    const labels = ["Provisional diagnosis", "Admission notes", "Observations", "Hypotheses", "Treatment plan", "Limitations", "Take your treatment plan"];
    const positions = labels.map((l) => order.findIndex((t) => t.startsWith(l)));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((x, y) => x - y)).toEqual(positions);

    const nav = page.getByRole("navigation", { name: "Chart sections" });
    for (const [label, id] of [["Summary", "summary"], ["Admission notes", "admission"], ["Observations", "observations"], ["Hypotheses", "hypotheses"], ["Treatment plan", "plan"], ["Limitations", "limitations"], ["Export", "export"]]) {
      await expect(nav.getByRole("link", { name: label })).toHaveAttribute("href", `#${id}`);
      await expect(page.locator(`section#${id}`)).toHaveCount(1);
    }
    // Navigation column sits beside the reading column on desktop.
    const navBox = await nav.boundingBox();
    const bodyBox = await page.locator("section#summary").boundingBox();
    expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(bodyBox!.x);
  });

  test("on a phone the section links wrap above the report", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/chart/saas-portal-access");
    const nav = await page.getByRole("navigation", { name: "Chart sections" }).boundingBox();
    const summary = await page.locator("section#summary").boundingBox();
    expect(nav!.y + nav!.height).toBeLessThanOrEqual(summary!.y);
  });

  test("tasks are stacked rows with priority in words, confidence in words, and no implied certification", async ({ page }) => {
    await page.goto("/chart/booking-double-reservations");
    const row = page.locator("li", { hasText: "Reproduce the race condition" }).first();
    await expect(row).toContainText(/P1 · High/);
    await expect(row.getByRole("group", { name: /Status for/ }).getByRole("button")).toHaveText([/Todo/, /In progress/, /Verified by you/]);
    await expect(row.locator("summary")).toContainText("Acceptance criteria and discharge checklist (0/3)");
    await expect(page.getByText(/Confidence: (low|medium|high)/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset this sample" })).toBeVisible();
    // The export keeps the full intake and personal notes opt-in.
    await expect(page.getByLabel(/Include full intake and personal notes/)).not.toBeChecked();
  });

  test("an evidence panel opens next to its finding, and Reset closes it", async ({ page }) => {
    await page.goto("/chart/booking-double-reservations");
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    const obs = page.locator("#observations li").first();
    await obs.getByRole("button", { name: /View evidence/ }).click();
    const panel = obs.getByRole("region", { name: "Why this finding?" });
    await expect(panel).toBeVisible();
    await expect(panel.locator("pre").first()).not.toBeEmpty();
    // Opening a panel calls nothing. (Next's own background link prefetches are not part of the panel.)
    expect(requests.filter((u) => !u.includes("_rsc="))).toEqual([]);
    await page.getByRole("button", { name: "Reset this sample" }).click();
    await expect(page.getByRole("region", { name: "Why this finding?" })).toHaveCount(0);
  });
});

for (const size of SIZES) {
  test.describe(`at ${size.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
    });

    for (const path of PAGES) {
      test(`${path}: no horizontal scroll, 44px targets, readable text`, async ({ page }) => {
        await page.goto(path);
        if (path.startsWith("/chart/")) await page.locator("summary").first().click();
        expect(await overflowsHorizontally(page)).toBe(false);

        const small = await page.evaluate(() => {
          const out: string[] = [];
          const visible = (el: Element) => {
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && s.visibility !== "hidden";
          };
          // Controls: buttons, summaries, nav links and form fields all keep a 44px minimum height.
          for (const el of document.querySelectorAll("button, summary, a.nav-link, input:not([type=checkbox]), textarea")) {
            if (el.closest(".sr-only") || !visible(el)) continue;
            const h = el.getBoundingClientRect().height;
            if (h < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}" is ${Math.round(h)}px tall`);
          }
          // Checkbox rows: the whole label is the target.
          for (const el of document.querySelectorAll("label:has(input[type=checkbox])")) {
            if (!visible(el)) continue;
            const h = el.getBoundingClientRect().height;
            if (h < 43.5) out.push(`checkbox row "${(el.textContent ?? "").trim().slice(0, 30)}" is ${Math.round(h)}px tall`);
          }
          // Text: essential copy is at least 14px. Mono metadata labels may be 13px.
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          const seen = new Set<Element>();
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const el = n.parentElement;
            if (!el || seen.has(el) || !(n.textContent ?? "").trim()) continue;
            seen.add(el);
            if (!visible(el) || el.closest(".sr-only, script, style, [aria-hidden=true]")) continue;
            const px = parseFloat(getComputedStyle(el).fontSize);
            const mono = getComputedStyle(el).fontFamily.toLowerCase().includes("mono");
            if (px < (mono ? 12.99 : 13.99)) out.push(`text "${(n.textContent ?? "").trim().slice(0, 30)}" is ${px}px`);
          }
          return out;
        });
        expect(small).toEqual([]);
      });
    }
  });
}

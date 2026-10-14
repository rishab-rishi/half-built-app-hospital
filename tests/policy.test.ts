import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/policy";

describe("policy versions", () => {
  it("match the example environment file", () => {
    const env = readFileSync(".env.example", "utf8");
    expect(env).toContain(`TERMS_VERSION=${TERMS_VERSION}`);
    expect(env).toContain(`PRIVACY_VERSION=${PRIVACY_VERSION}`);
  });
});

describe("published contact details", () => {
  const files = ["src/app/terms/page.tsx", "src/app/privacy/page.tsx", "src/app/security/page.tsx", "SECURITY.md"];

  it("use one address everywhere and leave no contact placeholder", () => {
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/PUBLIC CONTACT ADDRESS/);
    }
    const addresses = new Set(
      files.flatMap((f) => readFileSync(f, "utf8").match(/[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g) ?? []),
    );
    expect([...addresses]).toEqual(["cold.start001@gmail.com"]);
  });

  it("the privacy notice links every provider it names", () => {
    const text = readFileSync("src/app/privacy/page.tsx", "utf8");
    for (const url of [
      "https://vercel.com/legal/privacy-notice",
      "https://groq.com/privacy-policy",
      "https://upstash.com/trust/privacy.pdf",
      "https://www.cloudflare.com/privacypolicy/",
    ]) {
      expect(text).toContain(url);
    }
  });
});

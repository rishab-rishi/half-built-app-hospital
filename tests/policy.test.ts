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

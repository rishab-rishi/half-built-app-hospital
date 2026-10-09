import { describe, expect, it } from "vitest";
import { evalFixtures } from "../eval/fixtures";
import type { EvalCategory } from "../eval/types";
import { buildEvidenceMap } from "@/lib/evidence";
import { diagnoseMessages, triageMessages } from "@/lib/prompts";
import { intakeSchema } from "@/lib/schemas";
import { findLikelySecret } from "@/lib/secrets";
import { estimateTokens, MAX_INPUT_TOKENS } from "@/lib/tokens";

const textOf = (i: (typeof evalFixtures)[number]["intake"]) =>
  [i.title, i.purpose, i.symptoms, i.error, ...i.stack, ...i.working].join("\n");
const byId = (id: string) => evalFixtures.find((f) => f.id === id)!;

describe("evaluation fixtures", () => {
  it("has the intended 18 cases in order", () => {
    expect(evalFixtures.map((f) => f.id)).toEqual([
      "clear-01", "clear-02", "clear-03", "insufficient-01", "insufficient-02", "conflicting-01", "conflicting-02",
      "malicious-01", "malicious-02", "malicious-03", "secret-01", "secret-02", "auth-01", "auth-02", "payment-01",
      "nonlatin-01", "nonlatin-02", "other-01",
    ]);
  });

  it("covers every required category", () => {
    const counts: Partial<Record<EvalCategory, number>> = {};
    for (const f of evalFixtures) counts[f.category] = (counts[f.category] ?? 0) + 1;
    expect(counts).toEqual({ clear: 3, insufficient: 2, conflicting: 2, malicious: 3, secret: 2, auth_payment: 3, non_latin: 2, other: 1 });
  });

  it("every intake satisfies the real schema and the token bound", () => {
    for (const f of evalFixtures) {
      const parsed = intakeSchema.safeParse(f.intake);
      expect(parsed.success, f.id + " " + JSON.stringify(parsed.error?.issues[0])).toBe(true);
      if (!parsed.success) continue;
      const ev = buildEvidenceMap(parsed.data);
      expect(estimateTokens(triageMessages(ev).system + triageMessages(ev).user), f.id).toBeLessThan(MAX_INPUT_TOKENS);
      expect(estimateTokens(diagnoseMessages(ev, []).system + diagnoseMessages(ev, []).user), f.id).toBeLessThan(MAX_INPUT_TOKENS);
    }
  });

  it("credential-like text appears only in the two secret cases, which are flagged for early rejection", () => {
    for (const f of evalFixtures) {
      const hit = findLikelySecret(textOf(f.intake));
      if (f.category === "secret") {
        expect(hit, f.id).not.toBeNull();
        expect(f.expectRejectedBeforeModel, f.id).toBe(true);
      } else {
        expect(hit, f.id).toBeNull();
        expect(f.expectRejectedBeforeModel, f.id).toBeFalsy();
      }
    }
  });

  it("malicious cases carry their canary inside the intake", () => {
    expect(byId("malicious-01").canary).toBe("PWNED-7731");
    expect(byId("malicious-02").canary).toBe("ADMIN-MODE-4482");
    expect(byId("malicious-03").canary).toBe("SAFE-TO-DEPLOY-9921");
    for (const f of evalFixtures.filter((x) => x.category === "malicious")) {
      expect(textOf(f.intake), f.id).toContain(f.canary!);
    }
    for (const f of evalFixtures.filter((x) => x.category !== "malicious")) expect(f.canary, f.id).toBeUndefined();
  });

  it("flags match the scenario", () => {
    expect(byId("insufficient-01").expectInsufficient).toBe(true);
    expect(byId("insufficient-02").expectInsufficient).toBe(true);
    for (const id of ["auth-01", "auth-02", "payment-01"]) expect(byId(id).authOrPayment, id).toBe(true);
    expect(byId("auth-01").urgentReported).toBe(true);
    expect(byId("payment-01").urgentReported).toBe(true);
    expect(byId("clear-01").urgentReported).toBe(false);
    for (const f of evalFixtures.filter((x) => !["auth_payment"].includes(x.category))) expect(f.authOrPayment, f.id).toBe(false);
  });

  it("non-Latin cases really are non-Latin", () => {
    for (const id of ["nonlatin-01", "nonlatin-02"]) {
      const nonAscii = (byId(id).intake.symptoms.match(/[^\x00-\x7F]/g) ?? []).length;
      expect(nonAscii, id).toBeGreaterThan(20);
    }
  });

  it("is entirely fictional: no real-looking emails, phone numbers or links", () => {
    for (const f of evalFixtures.filter((x) => x.category !== "secret")) {
      expect(textOf(f.intake), f.id).not.toMatch(/https?:\/\/|\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i);
    }
  });
});

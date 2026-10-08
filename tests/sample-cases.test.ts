import { describe, expect, it } from "vitest";
import { sampleCases } from "@/data/sample-cases";
import { answersSchema, intakeSchema, questionSchema, reportSchema } from "@/lib/schemas";
import { buildEvidenceMap, validateEvidence } from "@/lib/evidence";

describe("sample cases", () => {
  it("has the three expected patients", () => {
    expect(sampleCases.map((c) => c.id)).toEqual([
      "booking-double-reservations",
      "storefront-payment-state",
      "saas-portal-access",
    ]);
  });

  for (const c of sampleCases) {
    describe(c.id, () => {
      it("matches the schemas", () => {
        expect(intakeSchema.safeParse(c.intake).success).toBe(true);
        expect(c.questions.length).toBeGreaterThanOrEqual(2);
        for (const q of c.questions) expect(questionSchema.safeParse(q).success).toBe(true);
        expect(answersSchema.safeParse(c.answers).success).toBe(true);
        const r = reportSchema.safeParse(c.report);
        expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
      });

      it("answers only reference asked questions", () => {
        const ids = new Set(c.questions.map((q) => q.id));
        for (const a of c.answers) expect(ids.has(a.questionId)).toBe(true);
      });

      it("has no invalid evidence references", () => {
        const { dropped } = validateEvidence(c.report, buildEvidenceMap(c.intake, c.answers));
        expect(dropped).toBe(0);
      });

      it("does not claim to have scanned or certified anything", () => {
        const all = JSON.stringify(c.report).toLowerCase();
        expect(all).not.toMatch(/we (scanned|inspected|verified)|certified|(we|i) guarantee|guaranteed fix|safe to deploy/);
        expect(all).not.toMatch(/ is caused by | root cause is /);
        expect(all).not.toMatch(/https?:\/\/|<[a-z]/);
      });
    });
  }

  it("keeps the verbatim booking criterion", () => {
    const booking = sampleCases[0].report.recoveryTasks.flatMap((t) => t.acceptanceCriteria);
    expect(booking).toContain(
      "In staging, submit two overlapping reservations for the same slot concurrently. Exactly one is accepted; the other receives a clear conflict response. Confirm that only one reservation is persisted.",
    );
  });

  it("only the access case may carry P0", () => {
    for (const c of sampleCases.slice(0, 2)) {
      expect(c.report.recoveryTasks.some((t) => t.priority === "P0")).toBe(false);
    }
  });
});

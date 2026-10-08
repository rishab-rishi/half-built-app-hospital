import { describe, expect, it } from "vitest";
import { intakeSchema, reportSchema } from "@/lib/schemas";
import { buildEvidenceMap, validateEvidence } from "@/lib/evidence";

const intake = intakeSchema.parse({
  title: "Booking app",
  purpose: "Reserve slots",
  stack: ["Next.js"],
  working: ["Login"],
  symptoms: "Double bookings",
  error: "line one\r\nline two\n\nline four",
});

const baseReport = {
  summary: "s",
  assessmentStatus: "provisional",
  observations: [{ text: "o", evidenceIds: ["symptoms"] }],
  hypotheses: [
    { text: "h", explanation: "e", evidenceIds: ["bogus"], confidence: "low", verification: "v" },
  ],
  missingInformation: [],
  recoveryTasks: [
    {
      title: "t",
      priority: "P1",
      rationale: "r",
      evidenceIds: ["error:L4", "nope"],
      verification: "v",
      acceptanceCriteria: ["c1", "c2"],
    },
  ],
  limitations: ["not inspected"],
};

describe("intake schema", () => {
  it("rejects unknown fields", () => {
    expect(intakeSchema.safeParse({ ...intake, model: "x" }).success).toBe(false);
  });
  it("rejects over-length aggregate text", () => {
    const big = {
      ...intake,
      purpose: "a".repeat(1500),
      symptoms: "b".repeat(1500),
      error: "c".repeat(2000),
      working: ["d".repeat(200), "e".repeat(200)],
      stack: ["f".repeat(40)],
      title: "g".repeat(80),
    };
    // 1500+1500+2000+400+40+80 = 5520 < 6000, so push over with extra items
    expect(intakeSchema.safeParse(big).success).toBe(true);
    const over = { ...big, working: Array.from({ length: 8 }, () => "w".repeat(200)) };
    expect(intakeSchema.safeParse(over).success).toBe(false);
  });
});

describe("evidence", () => {
  it("numbers error lines after normalising newlines and skips blanks", () => {
    const m = buildEvidenceMap(intake);
    expect(m["error:L1"]).toBe("line one");
    expect(m["error:L2"]).toBe("line two");
    expect(m["error:L3"]).toBeUndefined();
    expect(m["error:L4"]).toBe("line four");
  });
  it("drops invalid references and flags the report incomplete", () => {
    const parsed = reportSchema.parse(baseReport);
    const { report, dropped } = validateEvidence(parsed, buildEvidenceMap(intake));
    expect(dropped).toBe(2);
    expect(report.incomplete).toBe(true);
    expect(report.hypotheses[0].evidenceIds).toEqual([]);
    expect(report.recoveryTasks[0].evidenceIds).toEqual(["error:L4"]);
    expect(report.recoveryTasks[0].criteria[1].id).toBe("task-1-c2");
  });
  it("ignores prototype-key IDs", () => {
    const parsed = reportSchema.parse({
      ...baseReport,
      observations: [{ text: "o", evidenceIds: ["constructor", "__proto__"] }],
    });
    const { report } = validateEvidence(parsed, buildEvidenceMap(intake));
    expect(report.observations).toEqual([]);
  });
  it("rejects extra model fields", () => {
    expect(reportSchema.safeParse({ ...baseReport, extra: 1 }).success).toBe(false);
  });
});

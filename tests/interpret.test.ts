import { describe, expect, it } from "vitest";
import { buildEvidenceMap } from "@/lib/evidence";
import { interpretDiagnosis, interpretTriage } from "@/lib/interpret";
import { diagnoseMessages } from "@/lib/prompts";
import { intake, reportJson } from "./helpers/harness";

const evidence = buildEvidenceMap(intake, [{ questionId: "q1", text: "Timeout at step 3" }]);
const diagnose = (over: Record<string, unknown>) => interpretDiagnosis(reportJson(over), evidence);
const task = (over: Record<string, unknown> = {}) => ({
  title: "t",
  priority: "P1",
  rationale: "r",
  evidenceIds: ["symptoms"],
  verification: "v",
  acceptanceCriteria: ["Run two bookings at once in staging and confirm only one is stored."],
  ...over,
});
const hyp = (over: Record<string, unknown> = {}) => ({
  text: "h",
  explanation: "e",
  evidenceIds: ["symptoms", "purpose"],
  confidence: "medium",
  verification: "v",
  ...over,
});

describe("evidence list tidy-up", () => {
  it("trims more than three evidence ids and de-duplicates, without marking the report incomplete", () => {
    const r = diagnose({
      observations: [{ text: "o", evidenceIds: ["symptoms", "symptoms", "purpose", "title", "stack:0", "working:0"] }],
    });
    expect(r.ok && r.value.report.observations[0].evidenceIds).toEqual(["symptoms", "purpose", "title"]);
    expect(r.ok && r.value.report.incomplete).toBe(false);
  });

  it("still removes invented ids and flags the report", () => {
    const r = diagnose({ observations: [{ text: "o", evidenceIds: ["symptoms", "error:L99"] }] });
    expect(r.ok && r.value.dropped).toBe(1);
    expect(r.ok && r.value.report.incomplete).toBe(true);
  });
});

describe("triage tidy-up", () => {
  it("fills a missing explanation with a generic reason instead of failing the case", () => {
    const r = interpretTriage(JSON.stringify({ questions: [{ id: "x", text: "What is the log?" }] }));
    expect(r.ok && r.value[0]).toEqual({ id: "q1", text: "What is the log?", why: "Helps narrow down the cause." });
  });

  it("still rejects more than three questions and malformed output", () => {
    const four = { questions: Array.from({ length: 4 }, () => ({ text: "q", why: "w" })) };
    expect(interpretTriage(JSON.stringify(four))).toMatchObject({ ok: false, reason: "schema" });
    expect(interpretTriage("nope")).toMatchObject({ ok: false, reason: "json" });
  });
});

describe("caution rules", () => {
  it("downgrades P0 unless the rationale states the reported urgency", () => {
    const r = diagnose({
      recoveryTasks: [
        task({ priority: "P0", rationale: "Prevents the reload." }),
        task({ priority: "P0", rationale: "Reported urgent: customers see each other's invoices." }),
      ],
    });
    expect(r.ok && r.value.report.recoveryTasks.map((t) => t.priority)).toEqual(["P1", "P0"]);
    expect(r.ok && r.value.adjusted).toBe(1);
  });

  it("caps confidence by the amount of evidence", () => {
    const r = diagnose({
      hypotheses: [
        hyp({ confidence: "high", evidenceIds: ["symptoms"] }),
        hyp({ confidence: "high", evidenceIds: [] }),
        hyp({ confidence: "high", evidenceIds: ["symptoms", "purpose"] }),
        hyp({ confidence: "low", evidenceIds: [] }),
      ],
    });
    expect(r.ok && r.value.report.hypotheses.map((h) => h.confidence)).toEqual(["medium", "low", "high", "low"]);
  });

  it("never raises confidence or priority", () => {
    const r = diagnose({ hypotheses: [hyp({ confidence: "low" })], recoveryTasks: [task({ priority: "P3" })] });
    expect(r.ok && r.value.report.hypotheses[0].confidence).toBe("low");
    expect(r.ok && r.value.report.recoveryTasks[0].priority).toBe("P3");
    expect(r.ok && r.value.adjusted).toBe(0);
  });
});

describe("safety checks still apply", () => {
  it("rejects unsafe content and schema violations", () => {
    expect(diagnose({ summary: "This is safe to deploy." })).toMatchObject({ ok: false, reason: "unsafe" });
    expect(diagnose({ summary: "x".repeat(601) })).toMatchObject({ ok: false, reason: "schema" });
  });
});

describe("diagnosis prompt payload", () => {
  const questions = [
    { id: "q1", text: "What does the log show?", why: "w" },
    { id: "q2", text: "Which browser?", why: "w" },
  ];
  it("pairs answers with their evidence ids and never exposes bare question ids", () => {
    const m = diagnoseMessages(evidence, questions);
    const payload = JSON.parse(m.user.slice(m.user.indexOf("{")));
    expect(payload.answeredQuestions).toEqual([{ evidenceId: "answer:q1", question: "What does the log show?" }]);
    expect(payload.unansweredQuestions).toEqual(["Which browser?"]);
    expect(payload.validEvidenceIds).toContain("answer:q1");
    expect(JSON.stringify(payload)).not.toMatch(/"q[123]"/);
  });
});

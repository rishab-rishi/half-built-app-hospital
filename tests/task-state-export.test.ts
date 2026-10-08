import { describe, expect, it } from "vitest";
import { sampleCases } from "@/data/sample-cases";
import { buildEvidenceMap, validateEvidence } from "@/lib/evidence";
import { exportMarkdown, fenceFor, sanitise } from "@/lib/export-markdown";
import { initTaskState, progress, setConfirmed, setNote, setStatus, toggleCriterion } from "@/lib/task-state";

const c = sampleCases[0];
const evidence = buildEvidenceMap(c.intake, c.answers);
const { report } = validateEvidence(c.report, evidence);
const task = report.recoveryTasks[0];

describe("task state", () => {
  it("blocks Verified until all criteria are checked and confirmed", () => {
    let s = initTaskState("case-1", report);
    expect(setStatus(s, report, task.id, "verified").ok).toBe(false);
    for (const cr of task.criteria) s = toggleCriterion(s, report, task.id, cr.id, true);
    expect(setStatus(s, report, task.id, "verified").ok).toBe(false);
    s = setConfirmed(s, task.id, true);
    const r = setStatus(s, report, task.id, "verified");
    expect(r.ok).toBe(true);
    expect(progress(r.state, report).verified).toBe(1);
  });

  it("unchecking a criterion revokes Verified; moving back is always allowed", () => {
    let s = initTaskState("case-1", report);
    for (const cr of task.criteria) s = toggleCriterion(s, report, task.id, cr.id, true);
    s = setConfirmed(s, task.id, true);
    s = setStatus(s, report, task.id, "verified").state;
    s = toggleCriterion(s, report, task.id, task.criteria[0].id, false);
    expect(s.tasks[task.id].status).toBe("in_progress");
    expect(s.tasks[task.id].confirmedPerformed).toBe(false);
    expect(setStatus(s, report, task.id, "todo").ok).toBe(true);
  });

  it("ignores unknown criteria and caps notes", () => {
    let s = initTaskState("case-1", report);
    s = toggleCriterion(s, report, task.id, "bogus", true);
    expect(s.tasks[task.id].checkedCriterionIds).toEqual([]);
    s = setNote(s, task.id, "x".repeat(900));
    expect(s.tasks[task.id].note.length).toBe(500);
  });

  it("is scoped to a case id", () => {
    expect(initTaskState("a", report).caseId).toBe("a");
  });
});

describe("markdown export", () => {
  const base = {
    report,
    evidence,
    taskState: initTaskState("sample:booking", report),
    provenance: "sample" as const,
    generatedAt: new Date("2026-10-09T10:00:00Z"),
  };

  it("labels samples, includes limitations, omits intake by default", () => {
    const r = exportMarkdown(base);
    if (!r.ok) throw new Error("export failed");
    expect(r.markdown).toContain("Fictional sample - not an assessment of your app");
    expect(r.markdown).toContain("AI-generated and provisional");
    expect(r.markdown).toContain("## Limitations");
    expect(r.markdown).not.toContain("Full intake");
    expect(r.markdown).toContain("Generated: 2026-10-09 (UTC)");
  });

  it("includes full intake only when asked", () => {
    const r = exportMarkdown({ ...base, includeFullIntake: { intake: c.intake, includeNotes: false } });
    expect(r.ok && r.markdown.includes("Full intake")).toBe(true);
  });

  it("keeps hostile content inside fences", () => {
    const evil = "```\n# FAKE HEADING\n![x](http://evil)\n<script>alert(1)</script>";
    const r = exportMarkdown({ ...base, report: { ...report, summary: evil } });
    if (!r.ok) throw new Error("export failed");
    expect(r.markdown).toContain("````text");
    const start = r.markdown.indexOf("````text");
    const end = r.markdown.indexOf("\n````", start + 8);
    expect(r.markdown.slice(start, end)).toContain("# FAKE HEADING");
    const outside = r.markdown.slice(0, start) + r.markdown.slice(end);
    expect(outside.match(/^# /gm)?.length).toBe(1);
    expect(outside).not.toContain("<script>");
  });

  it("strips control and bidi characters and reports it", () => {
    const r = exportMarkdown({ ...base, report: { ...report, summary: "a\u0000b‮c" } });
    if (!r.ok) throw new Error("export failed");
    expect(r.markdown).toContain("abc");
    expect(r.sanitised).toBe(true);
    expect(r.markdown).toContain("Notice:");
  });

  it("rejects oversize exports instead of truncating", () => {
    const huge = { ...report, summary: "x".repeat(200_000) };
    expect(exportMarkdown({ ...base, report: huge })).toEqual({ ok: false, reason: "too_large" });
  });

  it("fence helper and sanitiser basics", () => {
    expect(fenceFor("``` and ````")).toBe("`````");
    expect(fenceFor("plain")).toBe("```");
    expect(sanitise("a\tb\nc").changed).toBe(false);
  });
});

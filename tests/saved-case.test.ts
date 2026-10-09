import { describe, expect, it } from "vitest";
import { sampleCases } from "@/data/sample-cases";
import { buildEvidenceMap, validateEvidence } from "@/lib/evidence";
import { clearSavedCase, loadSavedCase, reconcileTaskState, saveCase, SAVED_CASE_KEY, type SavedCase } from "@/lib/saved-case";
import { initTaskState, setConfirmed, setStatus, toggleCriterion } from "@/lib/task-state";

class FakeStorage {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
  removeItem = (k: string) => void this.data.delete(k);
}

const c = sampleCases[0];
const report = validateEvidence(c.report, buildEvidenceMap(c.intake, c.answers)).report;
const make = (): SavedCase => ({
  v: 1,
  savedAt: "2026-10-10T10:00:00.000Z",
  caseId: "case-1",
  intake: { ...c.intake, error: c.intake.error ?? "" },
  questions: c.questions,
  answers: { q1: "Timeout at step 3" },
  report,
  taskState: initTaskState("case-1", report),
});

describe("saved case", () => {
  it("round-trips a finished case", () => {
    const s = new FakeStorage();
    expect(saveCase(make(), s)).toBe(true);
    const back = loadSavedCase(s);
    expect(back?.report.recoveryTasks.length).toBe(report.recoveryTasks.length);
    expect(back?.intake.title).toBe(c.intake.title);
    expect(back?.answers).toEqual({ q1: "Timeout at step 3" });
  });

  it("stores nothing that grants access: no ticket, token, cookie or session data", () => {
    const s = new FakeStorage();
    saveCase(make(), s);
    expect(Object.keys(JSON.parse(s.data.get(SAVED_CASE_KEY)!)).sort()).toEqual(
      ["answers", "caseId", "intake", "questions", "report", "savedAt", "taskState", "v"],
    );
  });

  it("deletes and ignores malformed, tampered or foreign data", () => {
    for (const bad of ["not json", "{}", JSON.stringify({ ...make(), v: 2 }), JSON.stringify({ ...make(), extra: 1 })]) {
      const s = new FakeStorage();
      s.setItem(SAVED_CASE_KEY, bad);
      expect(loadSavedCase(s)).toBeNull();
      expect(s.data.has(SAVED_CASE_KEY)).toBe(false);
    }
  });

  it("rejects values that break the schema limits (e.g. an oversized note)", () => {
    const m = make();
    m.taskState.tasks[report.recoveryTasks[0].id].note = "x".repeat(501);
    const s = new FakeStorage();
    s.setItem(SAVED_CASE_KEY, JSON.stringify(m));
    expect(loadSavedCase(s)).toBeNull();
  });

  it("clear removes it, and a missing or throwing storage never throws", () => {
    const s = new FakeStorage();
    saveCase(make(), s);
    clearSavedCase(s);
    expect(loadSavedCase(s)).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(saveCase(make(), broken)).toBe(false);
    expect(loadSavedCase(broken)).toBeNull();
    expect(() => clearSavedCase(broken)).not.toThrow();
    expect(saveCase(make(), null)).toBe(false);
    expect(loadSavedCase(null)).toBeNull();
  });
});

describe("restored checklist state", () => {
  const task = report.recoveryTasks[0];

  it("keeps a verification that still stands", () => {
    let st = initTaskState("case-1", report);
    for (const cr of task.criteria) st = toggleCriterion(st, report, task.id, cr.id, true);
    st = setConfirmed(st, task.id, true);
    st = setStatus(st, report, task.id, "verified").state;
    expect(reconcileTaskState(report, st).tasks[task.id].status).toBe("verified");
  });

  it("demotes a tampered 'verified' that lacks checks or confirmation", () => {
    const st = initTaskState("case-1", report);
    st.tasks[task.id] = { status: "verified", checkedCriterionIds: [], confirmedPerformed: false, note: "" };
    const r = reconcileTaskState(report, st).tasks[task.id];
    expect(r.status).toBe("in_progress");
    expect(r.confirmedPerformed).toBe(false);
  });

  it("drops unknown tasks and criteria and fills in missing tasks", () => {
    const st = initTaskState("case-1", report);
    st.tasks["task-99"] = { status: "todo", checkedCriterionIds: [], confirmedPerformed: false, note: "" };
    st.tasks[task.id].checkedCriterionIds = ["bogus", task.criteria[0].id];
    delete st.tasks[report.recoveryTasks[1].id];
    const r = reconcileTaskState(report, st);
    expect(r.tasks["task-99"]).toBeUndefined();
    expect(r.tasks[task.id].checkedCriterionIds).toEqual([task.criteria[0].id]);
    expect(r.tasks[report.recoveryTasks[1].id].status).toBe("todo");
  });
});

import type { Report } from "./schemas";

export type TaskStatus = "todo" | "in_progress" | "verified";

export type TaskLocalState = {
  status: TaskStatus;
  checkedCriterionIds: string[];
  confirmedPerformed: boolean;
  note: string;
};

/** Local, user-owned state. Never supplied by the model; scoped to one case. */
export type CaseTaskState = {
  caseId: string;
  tasks: Record<string, TaskLocalState>;
};

export const NOTE_MAX = 500;

export function initTaskState(caseId: string, report: Report): CaseTaskState {
  const tasks: Record<string, TaskLocalState> = {};
  for (const t of report.recoveryTasks) {
    tasks[t.id] = { status: "todo", checkedCriterionIds: [], confirmedPerformed: false, note: "" };
  }
  return { caseId, tasks };
}

function update(state: CaseTaskState, taskId: string, patch: Partial<TaskLocalState>): CaseTaskState {
  const cur = state.tasks[taskId];
  if (!cur) return state;
  return { ...state, tasks: { ...state.tasks, [taskId]: { ...cur, ...patch } } };
}

export function toggleCriterion(
  state: CaseTaskState,
  report: Report,
  taskId: string,
  criterionId: string,
  checked: boolean,
): CaseTaskState {
  const task = report.recoveryTasks.find((t) => t.id === taskId);
  const cur = state.tasks[taskId];
  if (!task || !cur || !task.criteria.some((c) => c.id === criterionId)) return state;
  const set = new Set(cur.checkedCriterionIds);
  if (checked) set.add(criterionId);
  else set.delete(criterionId);
  const next = [...set];
  // Unchecking anything invalidates a prior verification.
  const stillAll = task.criteria.every((c) => set.has(c.id));
  return update(state, taskId, {
    checkedCriterionIds: next,
    ...(cur.status === "verified" && !stillAll
      ? { status: "in_progress" as const, confirmedPerformed: false }
      : {}),
  });
}

export function setConfirmed(state: CaseTaskState, taskId: string, confirmed: boolean): CaseTaskState {
  return update(state, taskId, { confirmedPerformed: confirmed });
}

export function setNote(state: CaseTaskState, taskId: string, note: string): CaseTaskState {
  return update(state, taskId, { note: note.slice(0, NOTE_MAX) });
}

export type StatusResult = { state: CaseTaskState; ok: true } | { state: CaseTaskState; ok: false; reason: string };

/** Verified requires every criterion checked plus explicit confirmation. Moving back is always allowed. */
export function setStatus(state: CaseTaskState, report: Report, taskId: string, status: TaskStatus): StatusResult {
  const task = report.recoveryTasks.find((t) => t.id === taskId);
  const cur = state.tasks[taskId];
  if (!task || !cur) return { ok: false, state, reason: "Unknown task." };
  if (status === "verified") {
    const all = task.criteria.every((c) => cur.checkedCriterionIds.includes(c.id));
    if (!all) return { ok: false, state, reason: "Check every criterion before marking this verified." };
    if (!cur.confirmedPerformed) {
      return { ok: false, state, reason: 'Confirm "I performed these checks" first.' };
    }
  }
  return { ok: true, state: update(state, taskId, { status }) };
}

export function progress(state: CaseTaskState, report: Report) {
  const total = report.recoveryTasks.length;
  const verified = report.recoveryTasks.filter((t) => state.tasks[t.id]?.status === "verified").length;
  const openUrgent = report.recoveryTasks.filter(
    (t) => (t.priority === "P0" || t.priority === "P1") && state.tasks[t.id]?.status !== "verified",
  );
  return { total, verified, openUrgent, complete: total > 0 && verified === total };
}

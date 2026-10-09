import "./zod-config";
import { z } from "zod";
import { intakeSchema, questionSchema, reportSchema, type Report } from "./schemas";
import { initTaskState, NOTE_MAX, type CaseTaskState } from "./task-state";

/**
 * Opt-in copy of a finished case in this tab's sessionStorage. Never localStorage, never on by default.
 * It holds only what the visitor already sees: no tickets, challenge tokens, session data, or case IDs from Redis.
 */
export const SAVED_CASE_KEY = "hh:saved-case:v1";

const storedReport = reportSchema
  .omit({ recoveryTasks: true })
  .extend({
    incomplete: z.boolean(),
    recoveryTasks: z
      .array(
        reportSchema.shape.recoveryTasks.element.extend({
          id: z.string().max(40),
          criteria: z.array(z.strictObject({ id: z.string().max(60), text: z.string().max(250) })).max(3),
        }),
      )
      .max(8),
  });

const taskStateSchema = z.strictObject({
  caseId: z.string().max(80),
  tasks: z.record(
    z.string().max(40),
    z.strictObject({
      status: z.enum(["todo", "in_progress", "verified"]),
      checkedCriterionIds: z.array(z.string().max(60)).max(3),
      confirmedPerformed: z.boolean(),
      note: z.string().max(NOTE_MAX),
    }),
  ),
});

const savedSchema = z.strictObject({
  v: z.literal(1),
  savedAt: z.string().max(40),
  caseId: z.string().max(80),
  intake: intakeSchema,
  questions: z.array(questionSchema).max(3),
  answers: z.record(z.string().max(10), z.string().max(700)),
  report: storedReport,
  taskState: taskStateSchema,
});
export type SavedCase = {
  v: 1;
  savedAt: string;
  caseId: string;
  intake: z.infer<typeof intakeSchema>;
  questions: z.infer<typeof questionSchema>[];
  answers: Record<string, string>;
  report: Report;
  taskState: CaseTaskState;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null; // blocked by browser settings
  }
}

/** Drop task entries the report does not have, add missing ones, and drop criterion IDs that do not exist. */
export function reconcileTaskState(report: Report, state: CaseTaskState): CaseTaskState {
  const fresh = initTaskState(state.caseId, report);
  for (const t of report.recoveryTasks) {
    const saved = state.tasks[t.id];
    if (!saved) continue;
    const valid = new Set(t.criteria.map((c) => c.id));
    const checked = saved.checkedCriterionIds.filter((id) => valid.has(id));
    const allChecked = t.criteria.every((c) => checked.includes(c.id));
    // A saved "verified" is only kept if its checks and confirmation still stand.
    const verified = saved.status === "verified" && allChecked && saved.confirmedPerformed;
    fresh.tasks[t.id] = {
      status: saved.status === "verified" && !verified ? "in_progress" : saved.status,
      checkedCriterionIds: checked,
      confirmedPerformed: verified ? true : saved.confirmedPerformed && allChecked,
      note: saved.note.slice(0, NOTE_MAX),
    };
  }
  return fresh;
}

export function saveCase(data: SavedCase, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVED_CASE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false; // quota exceeded or storage unavailable: the page keeps working without it
  }
}

export function clearSavedCase(storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.removeItem(SAVED_CASE_KEY);
  } catch {
    /* nothing to do */
  }
}

/** Returns a validated case or null. Anything malformed is deleted rather than trusted. */
export function loadSavedCase(storage: StorageLike | null = browserStorage()): SavedCase | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(SAVED_CASE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed = savedSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      const d = parsed.data as unknown as SavedCase;
      return { ...d, taskState: reconcileTaskState(d.report, d.taskState) };
    }
  } catch {
    /* fall through */
  }
  clearSavedCase(storage);
  return null;
}

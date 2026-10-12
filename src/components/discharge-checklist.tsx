"use client";

import type { Report } from "@/lib/schemas";
import { NOTE_MAX, type TaskLocalState } from "@/lib/task-state";

type Task = Report["recoveryTasks"][number];

export function DischargeChecklist({
  task,
  local,
  onToggle,
  onConfirm,
  onNote,
  sample = false,
}: {
  sample?: boolean;
  task: Task;
  local: TaskLocalState;
  onToggle: (criterionId: string, checked: boolean) => void;
  onConfirm: (confirmed: boolean) => void;
  onNote: (note: string) => void;
}) {
  const base = `check-${task.id}`;
  return (
    <fieldset className="mt-1 space-y-1 rounded-md border border-border bg-paper p-4">
      <legend className="px-1 font-medium">How will I know this is fixed?</legend>
      {sample && <p className="text-[0.9375rem] font-semibold">Fictional sample - not an assessment of your app.</p>}
      <p className="pb-1 text-[0.9375rem] text-muted-foreground">
        Run these checks yourself, ideally in staging. Ticking a box records your own confirmation; it is
        not an AI or security certification.
      </p>
      {task.criteria.map((c) => (
        <label key={c.id} className="flex min-h-11 items-start gap-3 py-2 text-[0.9375rem] leading-snug">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0"
            checked={local.checkedCriterionIds.includes(c.id)}
            onChange={(e) => onToggle(c.id, e.target.checked)}
          />
          <span className="break-words">{c.text}</span>
        </label>
      ))}
      <label className="flex min-h-11 items-start gap-3 border-t border-border py-3 text-[0.9375rem] font-medium">
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0"
          checked={local.confirmedPerformed}
          onChange={(e) => onConfirm(e.target.checked)}
        />
        <span>I performed these checks</span>
      </label>
      <div className="pt-1">
        <label htmlFor={`${base}-note`} className="text-[0.9375rem] text-muted-foreground">
          Personal note (plain text, stays in this browser tab)
        </label>
        <textarea
          id={`${base}-note`}
          className="field mt-1.5"
          rows={2}
          maxLength={NOTE_MAX}
          value={local.note}
          onChange={(e) => onNote(e.target.value)}
        />
        <p className="mt-1 text-right text-sm text-muted-foreground">
          {local.note.length}/{NOTE_MAX}
        </p>
      </div>
    </fieldset>
  );
}

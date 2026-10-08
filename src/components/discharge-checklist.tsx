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
}: {
  task: Task;
  local: TaskLocalState;
  onToggle: (criterionId: string, checked: boolean) => void;
  onConfirm: (confirmed: boolean) => void;
  onNote: (note: string) => void;
}) {
  const base = `check-${task.id}`;
  return (
    <fieldset className="mt-3 space-y-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">How will I know this is fixed?</legend>
      <p className="text-xs text-muted-foreground">
        Run these checks yourself, ideally in staging. Ticking a box records your own confirmation; it is
        not an AI or security certification.
      </p>
      {task.criteria.map((c) => (
        <label key={c.id} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={local.checkedCriterionIds.includes(c.id)}
            onChange={(e) => onToggle(c.id, e.target.checked)}
          />
          <span className="break-words">{c.text}</span>
        </label>
      ))}
      <label className="flex items-start gap-2 border-t pt-2 text-sm font-medium">
        <input
          type="checkbox"
          className="mt-1 size-4"
          checked={local.confirmedPerformed}
          onChange={(e) => onConfirm(e.target.checked)}
        />
        <span>I performed these checks</span>
      </label>
      <div>
        <label htmlFor={`${base}-note`} className="text-xs text-muted-foreground">
          Personal note (plain text, stays in this browser tab)
        </label>
        <textarea
          id={`${base}-note`}
          className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
          rows={2}
          maxLength={NOTE_MAX}
          value={local.note}
          onChange={(e) => onNote(e.target.value)}
        />
        <p className="text-right text-xs text-muted-foreground">
          {local.note.length}/{NOTE_MAX}
        </p>
      </div>
    </fieldset>
  );
}

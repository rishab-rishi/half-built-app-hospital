"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DischargeChecklist } from "@/components/discharge-checklist";
import type { Report } from "@/lib/schemas";
import {
  setConfirmed,
  setNote,
  setStatus,
  toggleCriterion,
  type CaseTaskState,
  type TaskStatus,
} from "@/lib/task-state";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "Todo" },
  { status: "in_progress", label: "In progress" },
  { status: "verified", label: "Verified (by you)" },
];

export function RecoveryBoard({
  report,
  state,
  onChange,
  onShowEvidence,
}: {
  report: Report;
  state: CaseTaskState;
  onChange: (next: CaseTaskState) => void;
  onShowEvidence: (heading: string, ids: string[]) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const move = (taskId: string, status: TaskStatus) => {
    const r = setStatus(state, report, taskId, status);
    setErrors((e) => ({ ...e, [taskId]: r.ok ? "" : r.reason }));
    if (r.ok) onChange(r.state);
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const tasks = report.recoveryTasks.filter((t) => state.tasks[t.id]?.status === col.status);
        return (
          <section key={col.status} aria-label={col.label} className="rounded-xl border bg-muted/30 p-3">
            <h3 className="mb-3 text-sm font-semibold">
              {col.label} <span className="text-muted-foreground">({tasks.length})</span>
            </h3>
            <ul className="space-y-3">
              {tasks.map((t) => {
                const local = state.tasks[t.id];
                return (
                  <li key={t.id} className="rounded-lg border bg-card p-3 text-card-foreground">
                    <div className="flex items-start gap-2">
                      <Badge
                        variant={t.priority === "P0" ? "default" : "secondary"}
                        className={t.priority === "P0" ? "border-transparent bg-red-700 text-white dark:bg-red-600" : undefined}
                      >
                        {t.priority}
                      </Badge>
                      <h4 className="text-sm font-medium break-words">{t.title}</h4>
                    </div>
                    <p className="mt-2 text-sm break-words text-muted-foreground">{t.rationale}</p>
                    <p className="mt-2 text-sm break-words">
                      <span className="font-medium">Check: </span>
                      {t.verification}
                    </p>
                    <Button
                      variant="link"
                      size="sm"
                      className="px-0"
                      onClick={() => onShowEvidence(t.title, t.evidenceIds)}
                    >
                      View evidence
                    </Button>
                    <div role="group" aria-label={`Status for ${t.title}`} className="mt-1 flex flex-wrap gap-1">
                      {COLUMNS.map((c) => (
                        <Button
                          key={c.status}
                          size="sm"
                          variant={local.status === c.status ? "default" : "outline"}
                          aria-pressed={local.status === c.status}
                          onClick={() => move(t.id, c.status)}
                        >
                          {c.status === "verified" ? "Verified" : c.label}
                        </Button>
                      ))}
                    </div>
                    {errors[t.id] && (
                      <p role="alert" className="mt-2 text-sm text-destructive">
                        {errors[t.id]}
                      </p>
                    )}
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-medium">
                        Discharge checklist ({local.checkedCriterionIds.length}/{t.criteria.length})
                      </summary>
                      <DischargeChecklist
                        task={t}
                        local={local}
                        onToggle={(cid, checked) => onChange(toggleCriterion(state, report, t.id, cid, checked))}
                        onConfirm={(v) => onChange(setConfirmed(state, t.id, v))}
                        onNote={(n) => onChange(setNote(state, t.id, n))}
                      />
                    </details>
                  </li>
                );
              })}
              {tasks.length === 0 && <li className="text-sm text-muted-foreground">Nothing here.</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

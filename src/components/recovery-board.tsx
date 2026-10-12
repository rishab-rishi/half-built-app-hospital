"use client";

import { useState } from "react";
import { DischargeChecklist } from "@/components/discharge-checklist";
import { EvidenceToggle } from "@/components/evidence-panel";
import type { EvidenceMap } from "@/lib/evidence";
import type { Report } from "@/lib/schemas";
import {
  setConfirmed,
  setNote,
  setStatus,
  toggleCriterion,
  type CaseTaskState,
  type TaskStatus,
} from "@/lib/task-state";

const STATUSES: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "Todo" },
  { status: "in_progress", label: "In progress" },
  { status: "verified", label: "Verified by you" },
];

// Priority is always written out, so it never depends on colour.
const PRIORITY: Record<string, string> = { P0: "Urgent, as reported", P1: "High", P2: "Medium", P3: "Low" };

/** Treatment tasks as readable stacked rows. Status and checklist state live with the visitor, never the model. */
export function RecoveryBoard({
  report,
  state,
  evidence,
  sample = false,
  openEvidence,
  onToggleEvidence,
  onChange,
}: {
  sample?: boolean;
  report: Report;
  state: CaseTaskState;
  evidence: EvidenceMap;
  openEvidence: Record<string, boolean>;
  onToggleEvidence: (key: string, open: boolean) => void;
  onChange: (next: CaseTaskState) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const move = (taskId: string, status: TaskStatus) => {
    const r = setStatus(state, report, taskId, status);
    setErrors((e) => ({ ...e, [taskId]: r.ok ? "" : r.reason }));
    if (r.ok) onChange(r.state);
  };

  return (
    <ul className="divide-y divide-border border-y border-border">
      {report.recoveryTasks.map((t, n) => {
        const local = state.tasks[t.id];
        const key = `task:${t.id}`;
        return (
          <li key={t.id} className="py-7">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="font-mono text-[0.8125rem] tracking-wider text-muted-foreground">
                {String(n + 1).padStart(2, "0")}
              </span>
              <span
                className={`inline-flex min-h-6 items-center rounded-md px-2 py-0.5 text-sm font-medium ${
                  t.priority === "P0" ? "bg-rust text-white" : "border border-input bg-paper text-foreground"
                }`}
              >
                {t.priority} · {PRIORITY[t.priority] ?? t.priority}
              </span>
            </div>
            <h3 className="mt-2.5 max-w-[40rem] text-xl leading-snug font-medium break-words">{t.title}</h3>
            <p className="mt-2 max-w-[40rem] break-words text-muted-foreground">{t.rationale}</p>
            <p className="mt-3 max-w-[40rem] break-words">
              <span className="font-medium">Check: </span>
              {t.verification}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
              <div role="group" aria-label={`Status for ${t.title}`} className="inline-flex overflow-hidden rounded-md border border-input">
                {STATUSES.map((c, i) => {
                  const active = local.status === c.status;
                  return (
                    <button
                      key={c.status}
                      type="button"
                      aria-pressed={active}
                      onClick={() => move(t.id, c.status)}
                      className={`min-h-11 px-3.5 text-[0.9375rem] font-medium transition-colors duration-150 sm:px-4 ${
                        i > 0 ? "border-l border-input" : ""
                      } ${active ? "bg-primary text-primary-foreground" : "bg-paper text-foreground hover:bg-secondary"}`}
                    >
                      {active && <span aria-hidden>✓ </span>}
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <EvidenceToggle
                ids={t.evidenceIds}
                evidence={evidence}
                sample={sample}
                open={Boolean(openEvidence[key])}
                onOpenChange={(o) => onToggleEvidence(key, o)}
              />
            </div>

            {errors[t.id] && (
              <p role="alert" className="notice mt-3">
                {errors[t.id]}
              </p>
            )}

            <details className="group mt-3">
              <summary className="flex min-h-11 items-center gap-2 font-medium marker:content-none">
                <span aria-hidden className="font-mono text-base transition-transform duration-150 group-open:rotate-90">
                  ›
                </span>
                Acceptance criteria and discharge checklist ({local.checkedCriterionIds.length}/{t.criteria.length})
              </summary>
              <DischargeChecklist
                sample={sample}
                task={t}
                local={local}
                onToggle={(cid, checked) => onChange(toggleCriterion(state, report, t.id, cid, checked))}
                onConfirm={(v) => onChange(setConfirmed(state, t.id, v))}
                onNote={(note) => onChange(setNote(state, t.id, note))}
              />
            </details>
          </li>
        );
      })}
    </ul>
  );
}

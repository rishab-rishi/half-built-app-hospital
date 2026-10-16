"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EvidenceToggle } from "@/components/evidence-panel";
import { QualityCard } from "@/components/quality-card";
import { RecoveryBoard } from "@/components/recovery-board";
import { SampleModeBanner } from "@/components/sample-mode-banner";
import { isReferenceId, type EvidenceMap } from "@/lib/evidence";
import { downloadMarkdown, exportMarkdown } from "@/lib/export-markdown";
import type { Intake, Report } from "@/lib/schemas";
import { initTaskState, progress, type CaseTaskState } from "@/lib/task-state";

function LiveBanner() {
  return (
    <div role="note" className="notice text-base">
      <strong>Provisional AI assessment of the details you supplied.</strong> Nothing was inspected, run, or
      scanned. Review every recommendation yourself and test changes in a separate environment.
    </div>
  );
}

const SECTIONS = [
  { id: "summary", label: "Summary" },
  { id: "admission", label: "Admission notes" },
  { id: "observations", label: "Observations" },
  { id: "hypotheses", label: "Hypotheses" },
  { id: "plan", label: "Treatment plan" },
  { id: "limitations", label: "Limitations" },
  { id: "export", label: "Export" },
];

const CONFIDENCE_DOTS = { low: 1, medium: 2, high: 3 } as const;

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="label-mono">{children}</p>;
}

export type ChartViewProps = {
  caseId: string;
  title: string;
  tagline?: string;
  intake: Intake;
  /** Already validated: evidence IDs checked and task/criterion IDs assigned. */
  report: Report;
  evidence: EvidenceMap;
  provenance: "sample" | "live";
  /** Live cases: clears the case from the page. */
  onClear?: () => void;
  /** Restoring a case the visitor chose to remember in this tab. */
  initialTaskState?: CaseTaskState;
  onTaskStateChange?: (state: CaseTaskState) => void;
};

export function ChartView({
  caseId,
  title,
  tagline,
  intake,
  report,
  evidence,
  provenance,
  onClear,
  initialTaskState,
  onTaskStateChange,
}: ChartViewProps) {
  const sample = provenance === "sample";
  const [taskState, setTaskState] = useState(() => initialTaskState ?? initTaskState(caseId, report));
  const notify = useRef(onTaskStateChange);
  useEffect(() => {
    notify.current = onTaskStateChange;
  });
  useEffect(() => {
    notify.current?.(taskState);
  }, [taskState]);
  // Which "Why this finding?" panels are open, keyed by finding. Cleared with the case.
  const [openEvidence, setOpenEvidence] = useState<Record<string, boolean>>({});
  const [includeFull, setIncludeFull] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  const toggleEvidence = (key: string, open: boolean) => setOpenEvidence((o) => ({ ...o, [key]: open }));
  const evidenceFor = (key: string, ids: string[]) => (
    <EvidenceToggle
      ids={ids}
      evidence={evidence}
      sample={sample}
      open={Boolean(openEvidence[key])}
      onOpenChange={(o) => toggleEvidence(key, o)}
    />
  );
  const prog = progress(taskState, report);
  const counts = { todo: 0, in_progress: 0, verified: 0 };
  for (const t of report.recoveryTasks) counts[taskState.tasks[t.id]?.status ?? "todo"]++;

  const doExport = () => {
    const result = exportMarkdown({
      report,
      evidence,
      taskState,
      provenance,
      generatedAt: new Date(),
      includeFullIntake: includeFull ? { intake, includeNotes: true } : null,
    });
    if (!result.ok) {
      setExportMessage("The export is too large. Turn off \"Include full intake and personal notes\" and try again.");
      return;
    }
    downloadMarkdown(result.markdown);
    setExportMessage(
      result.sanitised
        ? "Downloaded. Some control or formatting characters were removed from the text."
        : "Downloaded to your device. Review the file before sharing it; this site cannot delete it for you.",
    );
  };

  const reset = () => {
    setTaskState(initTaskState(caseId, report));
    setOpenEvidence({});
    setExportMessage("");
    onClear?.();
  };

  return (
    <div className="space-y-10">
      {sample ? <SampleModeBanner /> : <LiveBanner />}

      <header className="border-b border-border pb-10">
        <Kicker>{sample ? "Patient chart · Fictional sample" : "Patient chart"}</Kicker>
        <h1 className="display mt-4 max-w-[20ch] text-[clamp(2.5rem,5.6vw,4.25rem)] break-words">{title}</h1>
        {tagline && (
          <div className="mt-6 max-w-2xl border-l-2 border-rust pl-4">
            <Kicker>Reported symptom</Kicker>
            <p className="mt-1 text-lg leading-snug break-words">{tagline}</p>
          </div>
        )}
        <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button onClick={doExport}>Download plan (.md)</Button>
          <p role="status" className="text-[0.9375rem] text-muted-foreground">
            {exportMessage}
          </p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
        <nav aria-label="Chart sections" className="lg:sticky lg:top-6 lg:self-start">
          <p className="label-mono mb-2 hidden lg:block">On this chart</p>
          <ul className="-mx-1 flex flex-wrap gap-x-1 lg:mx-0 lg:flex-col lg:gap-0 lg:border-l lg:border-border">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="nav-link lg:rounded-none lg:pl-4">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-[50rem] space-y-16">
          <section id="summary" aria-labelledby="summary-heading" className="scroll-mt-6">
            <Kicker>Summary</Kicker>
            <h2 id="summary-heading" className="section-title mt-2">
              Provisional diagnosis
            </h2>
            <p className="mt-3">
              <Badge variant="outline">
                Status: {report.assessmentStatus === "provisional" ? "Provisional" : "Insufficient information"}
              </Badge>
            </p>
            <p className="display mt-5 text-[1.625rem] leading-[1.3] break-words sm:text-[1.875rem]">{report.summary}</p>
            {report.incomplete && (
              <p role="status" className="notice mt-4">
                Some unsupported evidence references were removed; this report is incomplete.
              </p>
            )}
          </section>

          <section id="admission" aria-labelledby="admission-heading" className="scroll-mt-6">
            <Kicker>Case notes</Kicker>
            <h2 id="admission-heading" className="section-title mt-2">
              Admission notes (as reported)
            </h2>
            <dl className="paper mt-5 divide-y divide-border">
              {[
                ["Purpose", intake.purpose],
                ["Stack", intake.stack.join(", ")],
                ["Reported symptoms", intake.symptoms],
              ].map(([label, value]) => (
                <div key={label} className="grid gap-1 p-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
                  <dt className="label-mono pt-1">{label}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section id="observations" aria-labelledby="obs-heading" className="scroll-mt-6">
            <Kicker>What the text shows</Kicker>
            <h2 id="obs-heading" className="section-title mt-2">
              Observations
            </h2>
            <ul className="mt-5 space-y-5">
              {report.observations.map((o, i) => (
                <li key={i} className="border-l-2 border-border pl-5">
                  <p className="break-words">{o.text}</p>
                  {evidenceFor(`obs:${i}`, o.evidenceIds)}
                </li>
              ))}
            </ul>
          </section>

          <section id="hypotheses" aria-labelledby="hyp-heading" className="scroll-mt-6">
            <Kicker>Not yet established</Kicker>
            <h2 id="hyp-heading" className="section-title mt-2">
              Hypotheses (not established facts)
            </h2>
            <ul className="mt-5 space-y-8">
              {report.hypotheses.map((h, i) => (
                <li key={i} className="border-l-2 border-rust pl-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      <span aria-hidden className="inline-flex gap-0.5">
                        {[1, 2, 3].map((d) => (
                          <span
                            key={d}
                            className={`size-1.5 rounded-full ${d <= CONFIDENCE_DOTS[h.confidence] ? "bg-primary" : "bg-primary/25"}`}
                          />
                        ))}
                      </span>
                      Confidence: {h.confidence}
                    </Badge>
                    {h.evidenceIds.every(isReferenceId) && <Badge variant="destructive">Unconfirmed possibility</Badge>}
                  </div>
                  <p className="mt-3 text-lg leading-snug font-medium break-words">{h.text}</p>
                  <p className="mt-2 break-words text-muted-foreground">{h.explanation}</p>
                  <p className="mt-2 break-words">
                    <span className="font-medium">How to verify: </span>
                    {h.verification}
                  </p>
                  {evidenceFor(`hyp:${i}`, h.evidenceIds)}
                </li>
              ))}
            </ul>
            {report.missingInformation.length > 0 && (
              <div className="paper mt-8 p-5">
                <h3 className="font-semibold">Missing information</h3>
                <ul className="mt-2 space-y-1.5">
                  {report.missingInformation.map((m, i) => (
                    <li key={i} className="flex gap-3 break-words">
                      <span aria-hidden className="mt-[0.7em] h-px w-3 shrink-0 bg-muted-foreground" />
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section id="plan" aria-labelledby="plan-heading" className="scroll-mt-6">
            <Kicker>Recovery plan</Kicker>
            <h2 id="plan-heading" className="section-title mt-2">
              Treatment plan
            </h2>
            <p role="status" className="mt-3" data-testid="progress">
              {prog.verified} of {prog.total} tasks marked verified by you.
              {prog.complete
                ? " Recovery checklist completed by you. This is your own confirmation, not a security certification."
                : prog.openUrgent.length > 0
                  ? ` Still open (P0/P1): ${prog.openUrgent.map((t) => t.title).join("; ")}.`
                  : ""}
            </p>
            <p className="label-mono mt-2">
              Todo {counts.todo} · In progress {counts.in_progress} · Verified by you {counts.verified}
            </p>
            <div className="mt-6">
              <RecoveryBoard
                sample={sample}
                report={report}
                state={taskState}
                evidence={evidence}
                openEvidence={openEvidence}
                onToggleEvidence={toggleEvidence}
                onChange={setTaskState}
              />
            </div>
          </section>

          <section id="limitations" aria-labelledby="lim-heading" className="scroll-mt-6 space-y-8">
            <div>
              <Kicker>What was not checked</Kicker>
              <h2 id="lim-heading" className="section-title mt-2">
                Limitations
              </h2>
              <ul className="mt-5 space-y-2">
                {report.limitations.map((l, i) => (
                  <li key={i} className="flex gap-3 break-words">
                    <span aria-hidden className="mt-[0.7em] h-px w-3 shrink-0 bg-rust" />
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            </div>
            <QualityCard />
          </section>

          <section id="export" aria-labelledby="export-heading" className="paper scroll-mt-6 p-6 sm:p-8">
            <Kicker>Take it with you</Kicker>
            <h2 id="export-heading" className="section-title mt-2">
              Take your treatment plan
            </h2>
            <label className="mt-5 flex min-h-11 items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0"
                checked={includeFull}
                onChange={(e) => setIncludeFull(e.target.checked)}
              />
              <span>
                Include full intake and personal notes (off by default). Even the referenced excerpts may contain
                sensitive information, so review the file before sharing it.
              </span>
            </label>
            <div className="mt-5">
              <Button onClick={doExport}>Download treatment plan (.md)</Button>
            </div>
            <p className="mt-4 text-[0.9375rem] text-muted-foreground">
              {sample
                ? "Resetting clears the checklist state in this tab. It cannot remove files you already downloaded."
                : "Clear case removes this case from the page and the checklist state in this tab. It cannot delete files you downloaded, browser backups, or records held by our hosting and AI providers."}
            </p>
            <div className="mt-2">
              <Button variant="ghost" onClick={reset} className="-ml-3">
                {sample ? "Reset this sample" : "Clear case"}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

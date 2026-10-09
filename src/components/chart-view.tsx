"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EvidenceDrawer, type EvidenceRequest } from "@/components/evidence-drawer";
import { QualityCard } from "@/components/quality-card";
import { RecoveryBoard } from "@/components/recovery-board";
import { SampleModeBanner } from "@/components/sample-mode-banner";
import type { EvidenceMap } from "@/lib/evidence";
import { downloadMarkdown, exportMarkdown } from "@/lib/export-markdown";
import type { Intake, Report } from "@/lib/schemas";
import { initTaskState, progress, type CaseTaskState } from "@/lib/task-state";

function LiveBanner() {
  return (
    <div role="note" className="rounded-lg border px-4 py-3 text-sm">
      <strong>Provisional AI assessment of the details you supplied.</strong> Nothing was inspected, run, or
      scanned. Review every recommendation yourself and test changes in a separate environment.
    </div>
  );
}

function EvidenceButton({ onClick, ids }: { onClick: () => void; ids: string[] }) {
  return (
    <Button variant="link" size="sm" className="px-0" onClick={onClick}>
      View evidence{ids.length === 0 ? " (none)" : ""}
    </Button>
  );
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
  const [request, setRequest] = useState<EvidenceRequest>(null);
  const [includeFull, setIncludeFull] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  const show = (heading: string, ids: string[]) => setRequest({ heading, ids });
  const prog = progress(taskState, report);

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
    setRequest(null);
    setExportMessage("");
    onClear?.();
  };

  return (
    <div className="space-y-8">
      {sample ? <SampleModeBanner /> : <LiveBanner />}

      <header>
        <p className="text-sm text-muted-foreground">{sample ? "Patient chart (fictional sample)" : "Patient chart"}</p>
        <h1 className="text-2xl font-bold break-words sm:text-3xl">{title}</h1>
        {tagline && <p className="mt-1 text-muted-foreground">{tagline}</p>}
      </header>

      <section aria-labelledby="admission-heading" className="rounded-xl border p-4">
        <h2 id="admission-heading" className="text-lg font-semibold">
          Admission notes (as reported)
        </h2>
        <dl className="mt-2 space-y-2 text-sm">
          <div>
            <dt className="font-medium">Purpose</dt>
            <dd className="break-words">{intake.purpose}</dd>
          </div>
          <div>
            <dt className="font-medium">Stack</dt>
            <dd>{intake.stack.join(", ")}</dd>
          </div>
          <div>
            <dt className="font-medium">Reported symptoms</dt>
            <dd className="break-words">{intake.symptoms}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="text-lg font-semibold">
          Provisional diagnosis
        </h2>
        <Badge variant="outline" className="mt-1">
          {report.assessmentStatus === "provisional" ? "Provisional" : "Insufficient information"}
        </Badge>
        <p className="mt-2 break-words">{report.summary}</p>
        {report.incomplete && (
          <p role="status" className="mt-2 text-sm text-destructive">
            Some unsupported evidence references were removed; this report is incomplete.
          </p>
        )}
      </section>

      <section aria-labelledby="obs-heading">
        <h2 id="obs-heading" className="text-lg font-semibold">
          Observations
        </h2>
        <ul className="mt-2 space-y-2">
          {report.observations.map((o, i) => (
            <li key={i} className="rounded-lg border p-3 text-sm">
              <p className="break-words">{o.text}</p>
              <EvidenceButton ids={o.evidenceIds} onClick={() => show(o.text, o.evidenceIds)} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="hyp-heading">
        <h2 id="hyp-heading" className="text-lg font-semibold">
          Hypotheses (not established facts)
        </h2>
        <ul className="mt-2 space-y-2">
          {report.hypotheses.map((h, i) => (
            <li key={i} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Confidence: {h.confidence}</Badge>
                {h.evidenceIds.length === 0 && <Badge variant="outline">Unconfirmed possibility</Badge>}
              </div>
              <p className="mt-2 font-medium break-words">{h.text}</p>
              <p className="mt-1 break-words text-muted-foreground">{h.explanation}</p>
              <p className="mt-1 break-words">
                <span className="font-medium">How to verify: </span>
                {h.verification}
              </p>
              <EvidenceButton ids={h.evidenceIds} onClick={() => show(h.text, h.evidenceIds)} />
            </li>
          ))}
        </ul>
        {report.missingInformation.length > 0 && (
          <div className="mt-4">
            <h3 className="font-medium">Missing information</h3>
            <ul className="list-disc pl-5 text-sm">
              {report.missingInformation.map((m, i) => (
                <li key={i} className="break-words">
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="plan-heading">
        <h2 id="plan-heading" className="text-lg font-semibold">
          Treatment plan
        </h2>
        <p role="status" className="mt-1 text-sm" data-testid="progress">
          {prog.verified} of {prog.total} tasks marked verified by you.
          {prog.complete
            ? " Recovery checklist completed by you. This is your own confirmation, not a security certification."
            : prog.openUrgent.length > 0
              ? ` Still open (P0/P1): ${prog.openUrgent.map((t) => t.title).join("; ")}.`
              : ""}
        </p>
        <div className="mt-3">
          <RecoveryBoard sample={sample} report={report} state={taskState} onChange={setTaskState} onShowEvidence={show} />
        </div>
      </section>

      <section aria-labelledby="lim-heading">
        <h2 id="lim-heading" className="text-lg font-semibold">
          Limitations
        </h2>
        <ul className="list-disc pl-5 text-sm">
          {report.limitations.map((l, i) => (
            <li key={i} className="break-words">
              {l}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="export-heading" className="rounded-xl border p-4">
        <h2 id="export-heading" className="text-lg font-semibold">
          Take your treatment plan
        </h2>
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={includeFull}
            onChange={(e) => setIncludeFull(e.target.checked)}
          />
          <span>
            Include full intake and personal notes (off by default). Even the referenced excerpts may contain
            sensitive information, so review the file before sharing it.
          </span>
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={doExport}>Download treatment plan (.md)</Button>
          <Button variant="outline" onClick={reset}>
            {sample ? "Reset this sample" : "Clear case"}
          </Button>
        </div>
        <p role="status" className="mt-2 text-sm">
          {exportMessage}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {sample
            ? "Resetting clears the checklist state in this tab. It cannot remove files you already downloaded."
            : "Clear case removes this case from the page and the checklist state in this tab. It cannot delete files you downloaded, browser backups, or records held by our hosting and AI providers."}
        </p>
      </section>

      <QualityCard />

      <EvidenceDrawer request={request} evidence={evidence} sample={sample} onClose={() => setRequest(null)} />
    </div>
  );
}

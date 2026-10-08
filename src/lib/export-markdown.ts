import type { EvidenceMap } from "./evidence";
import type { Intake, Report } from "./schemas";
import type { CaseTaskState } from "./task-state";

export const EXPORT_FILENAME = "hospital-treatment-plan.md";
export const EXPORT_MAX_BYTES = 128 * 1024;

export type ExportInput = {
  report: Report;
  evidence: EvidenceMap;
  taskState: CaseTaskState;
  provenance: "sample" | "live";
  generatedAt: Date;
  /** Opt-in only. Off by default. */
  includeFullIntake?: { intake: Intake; includeNotes: boolean } | null;
};

export type ExportResult =
  | { ok: true; markdown: string; sanitised: boolean }
  | { ok: false; reason: "too_large" };

// Control chars except tab/newline, plus bidirectional formatting controls.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const BIDI = /[؜‎‏‪-‮⁦-⁩]/g;

export function sanitise(s: string): { text: string; changed: boolean } {
  const text = s.replace(/\r\n?/g, "\n").replace(CONTROL, "").replace(BIDI, "");
  return { text, changed: text !== s.replace(/\r\n?/g, "\n") };
}

/** Fence longer than any run of backticks in the value. */
export function fenceFor(value: string): string {
  const longest = Math.max(0, ...(value.match(/`+/g) ?? []).map((r) => r.length));
  return "`".repeat(Math.max(3, longest + 1));
}

export function exportMarkdown(input: ExportInput): ExportResult {
  const { report, evidence, taskState, provenance, generatedAt } = input;
  let changed = false;

  const clean = (s: string) => {
    const r = sanitise(s);
    if (r.changed) changed = true;
    return r.text;
  };
  const block = (s: string) => {
    const v = clean(s);
    const f = fenceFor(v);
    return `${f}text\n${v}\n${f}`;
  };
  // Single-line model/user text goes in a fenced block too, so Markdown/HTML stays literal.
  const out: string[] = [];
  const push = (...l: string[]) => out.push(...l, "");

  push("# Half-Built App Hospital: treatment plan");
  push(`Generated: ${generatedAt.toISOString().slice(0, 10)} (UTC)`);
  push(
    provenance === "sample"
      ? "**Fictional sample - not an assessment of your app.**"
      : "**Source: live AI assessment of details you supplied.**",
  );
  push(
    "> AI-generated and provisional. This plan was produced from supplied text only; no code was inspected, run, or scanned. It is not a security audit or certification. Review every recommendation yourself and test changes in a separate environment.",
  );

  push("## Summary", block(report.summary));
  if (report.incomplete) push("_Some unsupported evidence references were removed; this report is incomplete._");

  const refs = new Set<string>();
  const cite = (ids: string[]) => {
    ids.forEach((i) => refs.add(i));
    return ids.length ? `Evidence: ${ids.join(", ")}` : "Unconfirmed possibility: no direct supporting evidence.";
  };

  push("## Observations");
  report.observations.forEach((o, i) => push(`### Observation ${i + 1}`, block(o.text), cite(o.evidenceIds)));
  if (!report.observations.length) push("None.");

  push("## Hypotheses");
  report.hypotheses.forEach((h, i) =>
    push(
      `### Hypothesis ${i + 1} (confidence: ${h.confidence})`,
      block(h.text),
      block(h.explanation),
      "Verification:",
      block(h.verification),
      cite(h.evidenceIds),
    ),
  );
  if (!report.hypotheses.length) push("None.");

  push("## Missing information");
  report.missingInformation.forEach((m) => push(block(m)));
  if (!report.missingInformation.length) push("None.");

  push("## Recovery tasks");
  for (const t of report.recoveryTasks) {
    const st = taskState.tasks[t.id];
    const status = st?.status === "verified" ? "User-marked verified" : st?.status === "in_progress" ? "In progress" : "Todo";
    push(
      `### ${t.id}: ${t.priority} - ${status}`,
      block(t.title),
      "Rationale:",
      block(t.rationale),
      "Verification:",
      block(t.verification),
      cite(t.evidenceIds),
      "Acceptance criteria:",
    );
    for (const c of t.criteria) {
      const done = st?.checkedCriterionIds.includes(c.id) ? "[x]" : "[ ]";
      push(`- ${done} (${c.id})`, block(c.text));
    }
    if (input.includeFullIntake?.includeNotes && st?.note) push("Personal note:", block(st.note));
  }
  if (!report.recoveryTasks.length) push("None.");

  push("## Evidence referenced");
  if (!refs.size) push("None.");
  for (const id of [...refs].sort()) {
    if (Object.hasOwn(evidence, id)) push(`### ${id}`, block(evidence[id]));
  }

  push("## Limitations");
  report.limitations.forEach((l) => push(block(l)));

  if (input.includeFullIntake) {
    const { intake } = input.includeFullIntake;
    push(
      "## Full intake (included at your request)",
      "Review before sharing: this may contain sensitive information.",
      block(
        [
          `Title: ${intake.title}`,
          `Purpose: ${intake.purpose}`,
          `Stack: ${intake.stack.join(", ")}`,
          `Working: ${intake.working.join("; ")}`,
          `Symptoms: ${intake.symptoms}`,
          intake.error ? `Error excerpt:\n${intake.error}` : "",
        ].join("\n"),
      ),
    );
  }

  if (changed) {
    push("_Notice: some control or bidirectional formatting characters were removed from the text above._");
  }
  push("_Recovery checklist items marked here were confirmed by you, not by the AI._");

  const markdown = out.join("\n");
  if (new TextEncoder().encode(markdown).length > EXPORT_MAX_BYTES) return { ok: false, reason: "too_large" };
  return { ok: true, markdown, sanitised: changed };
}

/** Browser-only helper: explicit click triggers a local download; URL released afterwards. */
export function downloadMarkdown(markdown: string): void {
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = EXPORT_FILENAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

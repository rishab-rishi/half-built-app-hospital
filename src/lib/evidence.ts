import { lookupReference } from "./playbook";
import type { Answers, Intake, ModelReport, Report } from "./schemas";

export type EvidenceMap = Record<string, string>;

/** Playbook references ("kb:<entry>#<section>") are background patterns, not facts the user supplied. */
export const isReferenceId = (id: string) => id.startsWith("kb:");

export function normaliseNewlines(s: string): string {
  return s.replace(/\r\n?/g, "\n");
}

/** Server-defined evidence IDs mapped to the exact supplied text. */
export function buildEvidenceMap(intake: Intake, answers: Answers = []): EvidenceMap {
  const map: EvidenceMap = Object.create(null);
  map.title = intake.title;
  map.purpose = intake.purpose;
  map.symptoms = intake.symptoms;
  intake.stack.forEach((s, i) => (map[`stack:${i}`] = s));
  intake.working.forEach((s, i) => (map[`working:${i}`] = s));
  if (intake.error) {
    normaliseNewlines(intake.error)
      .split("\n")
      .forEach((line, i) => {
        if (line.trim()) map[`error:L${i + 1}`] = line;
      });
  }
  for (const a of answers) map[`answer:${a.questionId}`] = a.text;
  return map;
}

/**
 * Validate evidence references. Unsupported references are dropped and the
 * report is flagged incomplete; they are never silently invented.
 * Hypotheses with no remaining evidence are kept (shown as unconfirmed);
 * observations with none are removed.
 * Playbook references may back hypotheses and tasks, but only the ones retrieved for this case, and never an
 * observation: observations are reported facts, and a reference is not a fact about the user's app.
 */
export function validateEvidence(
  report: ModelReport,
  map: EvidenceMap,
  references: EvidenceMap = {},
): { report: Report; dropped: number } {
  let dropped = 0;
  const clean = (ids: string[], allowReferences = true) => {
    const ok = [...new Set(ids)].filter(
      (id) => Object.hasOwn(map, id) || (allowReferences && Object.hasOwn(references, id)),
    );
    dropped += ids.length - ok.length;
    return ok;
  };
  const observations = report.observations
    .map((o) => ({ ...o, evidenceIds: clean(o.evidenceIds, false) }))
    .filter((o) => {
      if (o.evidenceIds.length) return true;
      dropped++;
      return false;
    });
  const hypotheses = report.hypotheses.map((h) => ({ ...h, evidenceIds: clean(h.evidenceIds) }));
  const tasks = report.recoveryTasks.map((t, i) => ({
    ...t,
    evidenceIds: clean(t.evidenceIds),
    id: `task-${i + 1}`,
    criteria: t.acceptanceCriteria.map((c, j) => ({ id: `task-${i + 1}-c${j + 1}`, text: c })),
  }));
  return {
    dropped,
    report: {
      ...report,
      observations,
      hypotheses,
      recoveryTasks: tasks,
      incomplete: dropped > 0,
    },
  };
}

/** Human-readable label for an evidence ID. Display only; never used for validation. */
export function describeEvidenceId(id: string): string {
  const fixed: Record<string, string> = {
    title: "App title",
    purpose: "Intended purpose",
    symptoms: "Reported symptoms",
  };
  if (Object.hasOwn(fixed, id)) return fixed[id];
  if (isReferenceId(id)) return `Reference: ${lookupReference(id)?.label ?? "unavailable"}`;
  const [kind, rest = ""] = id.split(":");
  if (kind === "stack") return `Stack item ${Number(rest) + 1}`;
  if (kind === "working") return `Working feature ${Number(rest) + 1}`;
  if (kind === "error") return `Error excerpt, line ${rest.replace(/^L/, "")}`;
  if (kind === "answer") return `Your answer to ${rest}`;
  return "Evidence";
}

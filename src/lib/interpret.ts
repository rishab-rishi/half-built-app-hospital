import { isReferenceId, validateEvidence, type EvidenceMap } from "./evidence";
import { findUnsafeOutput } from "./output-checks";
import { reportSchema, triageOutputSchema, type Question, type Report } from "./schemas";

export type Interpreted<T> = { ok: true; value: T } | { ok: false; reason: "json" | "schema" | "unsafe"; detail?: string };

const DEFAULT_WHY = "Helps narrow down the cause.";
const URGENT_MARKER = /^\s*reported urgent:/i;

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Deterministic, local tidy-ups of harmless slips before strict validation. This is not a repair call to the
 * model. Evidence lists over the display limit are trimmed and de-duplicated; nothing is invented.
 */
function trimEvidenceLists(json: unknown): unknown {
  if (!isRecord(json)) return json;
  const out: Record<string, unknown> = { ...json };
  for (const key of ["observations", "hypotheses", "recoveryTasks"]) {
    const list = out[key];
    if (!Array.isArray(list)) continue;
    out[key] = list.map((item) => {
      if (!isRecord(item) || !Array.isArray(item.evidenceIds)) return item;
      const ids = [...new Set(item.evidenceIds.filter((x): x is string => typeof x === "string"))].slice(0, 3);
      return { ...item, evidenceIds: ids };
    });
  }
  return out;
}

/** Single source of truth for turning raw triage output into questions. Used by the API and by the evaluator. */
export function interpretTriage(text: string): Interpreted<Question[]> {
  const json = parseJson(text);
  if (json === undefined) return { ok: false, reason: "json" };
  // A missing explanation should not consume the whole case; use a generic, app-authored reason.
  const filled =
    isRecord(json) && Array.isArray(json.questions)
      ? {
          ...json,
          questions: json.questions.map((q) =>
            isRecord(q) && (typeof q.why !== "string" || q.why.trim() === "") ? { ...q, why: DEFAULT_WHY } : q,
          ),
        }
      : json;
  const parsed = triageOutputSchema.safeParse(filled);
  if (!parsed.success) {
    return { ok: false, reason: "schema", detail: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}:${i.code}`).join(",") };
  }
  // Question IDs are normalised by the server, never trusted from the model.
  const questions = parsed.data.questions.map((q, i) => ({ id: `q${i + 1}`, text: q.text, why: q.why }));
  const unsafe = findUnsafeOutput(questions);
  return unsafe ? { ok: false, reason: "unsafe", detail: unsafe } : { ok: true, value: questions };
}

/**
 * Conservative corrections applied after validation. Both only move toward caution:
 * - "high" confidence needs two pieces of supplied evidence (none means "low", one means "medium").
 * - P0 needs an explicit "Reported urgent:" rationale; otherwise it becomes P1.
 */
export function applyCautionRules(report: Report): { report: Report; adjusted: number } {
  let adjusted = 0;
  const hypotheses = report.hypotheses.map((h) => {
    // Playbook references are leads, not corroboration: only evidence the user supplied raises confidence.
    const supplied = h.evidenceIds.filter((id) => !isReferenceId(id)).length;
    const cap = supplied === 0 ? "low" : supplied === 1 ? "medium" : "high";
    if (h.confidence === "high" && cap !== "high") {
      adjusted++;
      return { ...h, confidence: cap as "low" | "medium" };
    }
    if (h.confidence === "medium" && cap === "low") {
      adjusted++;
      return { ...h, confidence: "low" as const };
    }
    return h;
  });
  const recoveryTasks = report.recoveryTasks.map((t) => {
    if (t.priority === "P0" && !URGENT_MARKER.test(t.rationale)) {
      adjusted++;
      return { ...t, priority: "P1" as const };
    }
    return t;
  });
  return { report: { ...report, hypotheses, recoveryTasks }, adjusted };
}

/** Raw diagnosis output -> validated report with assigned IDs. Invalid evidence references are removed and counted. */
export function interpretDiagnosis(
  text: string,
  evidence: EvidenceMap,
  references: EvidenceMap = {},
): Interpreted<{ report: Report; dropped: number; adjusted: number }> {
  const json = parseJson(text);
  if (json === undefined) return { ok: false, reason: "json" };
  const parsed = reportSchema.safeParse(trimEvidenceLists(json));
  if (!parsed.success) {
    return { ok: false, reason: "schema", detail: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}:${i.code}`).join(",") };
  }
  const unsafe = findUnsafeOutput(parsed.data);
  if (unsafe) return { ok: false, reason: "unsafe", detail: unsafe };
  const { report, dropped } = validateEvidence(parsed.data, evidence, references);
  const { report: cautious, adjusted } = applyCautionRules(report);
  return { ok: true, value: { report: cautious, dropped, adjusted } };
}

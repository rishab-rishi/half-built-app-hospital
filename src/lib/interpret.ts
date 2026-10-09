import { validateEvidence, type EvidenceMap } from "./evidence";
import { findUnsafeOutput } from "./output-checks";
import { reportSchema, triageOutputSchema, type Question, type Report } from "./schemas";

export type Interpreted<T> = { ok: true; value: T } | { ok: false; reason: "json" | "schema" | "unsafe"; detail?: string };

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Single source of truth for turning raw triage output into questions. Used by the API and by the evaluator. */
export function interpretTriage(text: string): Interpreted<Question[]> {
  const json = parseJson(text);
  if (json === undefined) return { ok: false, reason: "json" };
  const parsed = triageOutputSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "schema" };
  // Question IDs are normalised by the server, never trusted from the model.
  const questions = parsed.data.questions.map((q, i) => ({ id: `q${i + 1}`, text: q.text, why: q.why }));
  const unsafe = findUnsafeOutput(questions);
  return unsafe ? { ok: false, reason: "unsafe", detail: unsafe } : { ok: true, value: questions };
}

/** Raw diagnosis output -> validated report with assigned IDs. Invalid evidence references are removed and counted. */
export function interpretDiagnosis(
  text: string,
  evidence: EvidenceMap,
): Interpreted<{ report: Report; dropped: number }> {
  const json = parseJson(text);
  if (json === undefined) return { ok: false, reason: "json" };
  const parsed = reportSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, reason: "schema", detail: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}:${i.code}`).join(",") };
  }
  const unsafe = findUnsafeOutput(parsed.data);
  if (unsafe) return { ok: false, reason: "unsafe", detail: unsafe };
  const { report, dropped } = validateEvidence(parsed.data, evidence);
  return { ok: true, value: { report, dropped } };
}

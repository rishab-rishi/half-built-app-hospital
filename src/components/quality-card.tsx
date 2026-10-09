import summary from "@/data/evaluation-summary.json";
import { evaluationSchema, evaluationView } from "@/lib/evaluation";
import { PROMPT_VERSION } from "@/lib/prompts";
import { FIXTURE_REVISION } from "../../eval/types";

const parsed = evaluationSchema.safeParse(summary);
const view = evaluationView(parsed.success ? parsed.data : { status: "pending" }, PROMPT_VERSION, FIXTURE_REVISION);

export function QualityCard() {
  return (
    <section aria-labelledby="quality-heading" className="rounded-xl border bg-card p-5 text-card-foreground">
      <h2 id="quality-heading" className="text-lg font-semibold">
        What this demo can prove
      </h2>
      <p className="mt-2 text-sm">
        Text-based provisional assessment; no repository inspection, code execution, or security certification.
      </p>
      {view.kind === "pending" ? (
        <p className="mt-3 text-sm">
          <strong>Evaluation pending.</strong> No measured model results have been published yet, and none are
          implied. Sample reports shown here are hand-reviewed fictional fixtures.
        </p>
      ) : (
        <div className="mt-3 text-sm">
          {view.kind === "stale" && (
            <p role="note" className="mb-2 rounded-md border border-amber-500/50 p-2">
              <strong>Out of date.</strong> These results were measured with prompt {view.evaluation.promptVersion} and
              do not describe the current version ({view.currentPromptVersion}), which has not been re-evaluated.
            </p>
          )}
          <p>
            Measured {view.evaluation.date} on {view.evaluation.casesEvaluated} fictional cases ({view.evaluation.modelId},
            prompt {view.evaluation.promptVersion}, fixtures {view.evaluation.fixtureRevision}). One run per case, so
            this shows what happened, not how reliable it is.
          </p>
          <ul className="mt-2 list-disc pl-5">
            {view.evaluation.checks.map((c) => (
              <li key={c.name}>
                {c.name}: {c.passed} of {c.total}
                {c.failedCases.length > 0 && ` (not met: ${c.failedCases.join(", ")})`}
              </li>
            ))}
          </ul>
          <p className="mt-2 font-medium">Known limitations</p>
          <ul className="list-disc pl-5">
            {view.evaluation.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

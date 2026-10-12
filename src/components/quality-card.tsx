import summary from "@/data/evaluation-summary.json";
import { evaluationSchema, evaluationView } from "@/lib/evaluation";
import { PROMPT_VERSION } from "@/lib/prompts";
import { FIXTURE_REVISION } from "../../eval/types";

const parsed = evaluationSchema.safeParse(summary);
const view = evaluationView(parsed.success ? parsed.data : { status: "pending" }, PROMPT_VERSION, FIXTURE_REVISION);

/**
 * The scope statement and any out-of-date warning stay visible. The measured results, including every case that
 * was not met and the known limitations, sit in a disclosure whose label says it includes the misses.
 */
export function QualityCard() {
  return (
    <section aria-labelledby="quality-heading" className="paper p-6 sm:p-7">
      <p className="label-mono">Evaluation</p>
      <h2 id="quality-heading" className="section-title mt-2 text-[1.75rem]">
        What this demo can prove
      </h2>
      <p className="mt-3">
        Text-based provisional assessment; no repository inspection, code execution, or security certification.
      </p>
      {view.kind === "pending" ? (
        <p className="mt-4">
          <strong>Evaluation pending.</strong> No measured model results have been published yet, and none are
          implied. Sample reports shown here are hand-reviewed fictional fixtures.
        </p>
      ) : (
        <>
          {view.kind === "stale" && (
            <p role="note" className="notice mt-4">
              <strong>Out of date.</strong> These results were measured with prompt {view.evaluation.promptVersion} and
              do not describe the current version ({view.currentPromptVersion}), which has not been re-evaluated.
            </p>
          )}
          <details className="group mt-5 border-t border-border">
            <summary className="flex min-h-11 items-center justify-between gap-4 py-2 font-medium marker:content-none">
              <span>How this was measured, including what was not met</span>
              <span aria-hidden className="font-mono text-lg transition-transform duration-150 group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="pb-1 pt-2">
              <p>
                Measured {view.evaluation.date} on {view.evaluation.casesEvaluated} fictional cases ({view.evaluation.modelId},
                prompt {view.evaluation.promptVersion}, fixtures {view.evaluation.fixtureRevision}). One run per case, so
                this shows what happened, not how reliable it is.
              </p>
              <ul className="mt-3 space-y-1.5">
                {view.evaluation.checks.map((c) => (
                  <li key={c.name} className="flex gap-3">
                    <span aria-hidden className="mt-[0.7em] h-px w-3 shrink-0 bg-muted-foreground" />
                    <span>
                      {c.name}: {c.passed} of {c.total}
                      {c.failedCases.length > 0 && ` (not met: ${c.failedCases.join(", ")})`}
                    </span>
                  </li>
                ))}
              </ul>
              <h3 className="mt-5 font-semibold">Known limitations</h3>
              <ul className="mt-2 space-y-1.5">
                {view.evaluation.limitations.map((l) => (
                  <li key={l} className="flex gap-3">
                    <span aria-hidden className="mt-[0.7em] h-px w-3 shrink-0 bg-rust" />
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

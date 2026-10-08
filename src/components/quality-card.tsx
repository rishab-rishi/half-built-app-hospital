import summary from "@/data/evaluation-summary.json";

type Evaluation =
  | { status: "pending" }
  | {
      status: "complete";
      date: string;
      casesEvaluated: number;
      modelId: string;
      promptVersion: string;
      fixtureRevision: string;
      checks: { name: string; passed: number }[];
      limitations: string[];
    };

const evaluation = summary as Evaluation;

export function QualityCard() {
  return (
    <section aria-labelledby="quality-heading" className="rounded-xl border bg-card p-5 text-card-foreground">
      <h2 id="quality-heading" className="text-lg font-semibold">
        What this demo can prove
      </h2>
      <p className="mt-2 text-sm">
        Text-based provisional assessment; no repository inspection, code execution, or security
        certification.
      </p>
      {evaluation.status === "pending" ? (
        <p className="mt-3 text-sm">
          <strong>Evaluation pending.</strong> No measured model results have been published yet, and
          none are implied. Sample reports shown here are hand-reviewed fictional fixtures.
        </p>
      ) : (
        <div className="mt-3 text-sm">
          <p>
            Evaluated {evaluation.date} on {evaluation.casesEvaluated} fictional cases ({evaluation.modelId},
            prompt {evaluation.promptVersion}, fixtures {evaluation.fixtureRevision}).
          </p>
          <ul className="mt-2 list-disc pl-5">
            {evaluation.checks.map((c) => (
              <li key={c.name}>
                {c.name}: {c.passed} of {evaluation.casesEvaluated}
              </li>
            ))}
          </ul>
          <p className="mt-2 font-medium">Known limitations</p>
          <ul className="list-disc pl-5">
            {evaluation.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

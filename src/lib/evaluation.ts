import { z } from "zod";

/** Shape of data/evaluation-summary.json. Written only by an intentional evaluation run. */
export const evaluationSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("pending") }),
  z.strictObject({
    status: z.literal("complete"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    casesEvaluated: z.number().int().positive(),
    modelId: z.string().min(1),
    promptVersion: z.string().min(1),
    fixtureRevision: z.string().min(1),
    providerRetries: z.number().int().nonnegative(),
    checks: z.array(
      z.strictObject({
        name: z.string().min(1),
        passed: z.number().int().nonnegative(),
        total: z.number().int().positive(),
        failedCases: z.array(z.string()),
      }),
    ),
    limitations: z.array(z.string().min(1)).min(1),
  }),
]);
export type Evaluation = z.infer<typeof evaluationSchema>;

export type EvaluationView =
  | { kind: "pending" }
  | { kind: "current"; evaluation: Extract<Evaluation, { status: "complete" }> }
  | { kind: "stale"; evaluation: Extract<Evaluation, { status: "complete" }>; currentPromptVersion: string };

/** Results are only "current" for the prompt version they were measured with. */
export function evaluationView(e: Evaluation, currentPromptVersion: string, currentFixtureRevision: string): EvaluationView {
  if (e.status === "pending") return { kind: "pending" };
  const stale = e.promptVersion !== currentPromptVersion || e.fixtureRevision !== currentFixtureRevision;
  return stale ? { kind: "stale", evaluation: e, currentPromptVersion } : { kind: "current", evaluation: e };
}

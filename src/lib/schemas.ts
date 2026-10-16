import "./zod-config";
import { z } from "zod";

export const LIMITS = {
  title: 80,
  purpose: 1500,
  stackItems: 12,
  stackItem: 40,
  workingItems: 8,
  workingItem: 200,
  symptoms: 1500,
  error: 2000,
  total: 6000,
  answers: 3,
  answer: 700,
} as const;

const text = (max: number) => z.string().trim().min(1).max(max);

const intakeBase = z.strictObject({
    title: text(LIMITS.title),
    purpose: text(LIMITS.purpose),
    stack: z.array(text(LIMITS.stackItem)).max(LIMITS.stackItems),
    working: z.array(text(LIMITS.workingItem)).max(LIMITS.workingItems),
    symptoms: text(LIMITS.symptoms),
    error: z.string().max(LIMITS.error).optional().default(""),
});
export type Intake = z.infer<typeof intakeBase>;
export const intakeSchema = intakeBase.refine((v) => intakeTextLength(v) <= LIMITS.total, {
  message: `Total text exceeds ${LIMITS.total} characters`,
});

export function intakeTextLength(v: Intake): number {
  return (
    v.title.length +
    v.purpose.length +
    v.symptoms.length +
    (v.error?.length ?? 0) +
    v.stack.reduce((n, s) => n + s.length, 0) +
    v.working.reduce((n, s) => n + s.length, 0)
  );
}

export const questionSchema = z.strictObject({
  id: z.string().regex(/^q[1-3]$/),
  text: text(300),
  why: text(250),
});
// Model-side shape: the id is advisory only. The server assigns q1..q3 after validation.
export const modelQuestionSchema = z.strictObject({
  id: z.string().max(40).optional(),
  text: text(300),
  why: text(250),
});
export const triageOutputSchema = z.strictObject({
  questions: z.array(modelQuestionSchema).max(3),
});
export type Question = z.infer<typeof questionSchema>;

export const answersSchema = z
  .array(
    z.strictObject({
      questionId: z.string().regex(/^q[1-3]$/),
      text: text(LIMITS.answer),
    }),
  )
  .max(LIMITS.answers);
export type Answers = z.infer<typeof answersSchema>;

// Long enough for a playbook reference such as "kb:database-connection-intermittent#notWhen".
const evidenceIds = z.array(z.string().min(1).max(64)).max(3);
const confidence = z.enum(["low", "medium", "high"]);

export const reportSchema = z.strictObject({
  summary: text(600),
  assessmentStatus: z.enum(["provisional", "insufficient_information"]),
  observations: z.array(z.strictObject({ text: text(300), evidenceIds })).max(5),
  hypotheses: z
    .array(
      z.strictObject({
        text: text(300),
        explanation: text(500),
        evidenceIds,
        confidence,
        verification: text(300),
      }),
    )
    .max(5),
  missingInformation: z.array(text(200)).max(5),
  recoveryTasks: z
    .array(
      z.strictObject({
        title: text(120),
        priority: z.enum(["P0", "P1", "P2", "P3"]),
        rationale: text(400),
        evidenceIds,
        verification: text(400),
        acceptanceCriteria: z.array(text(250)).min(1).max(3),
      }),
    )
    .max(8),
  limitations: z.array(text(250)).max(4),
});
export type ModelReport = z.infer<typeof reportSchema>;

/** Report after application code assigns IDs. Local state is kept separately. */
export type Report = Omit<ModelReport, "recoveryTasks"> & {
  incomplete: boolean;
  recoveryTasks: (ModelReport["recoveryTasks"][number] & {
    id: string;
    criteria: { id: string; text: string }[];
  })[];
};

import { intakeSchema, LIMITS, type Intake } from "./schemas";

export type FormValues = {
  title: string;
  purpose: string;
  stackText: string;
  workingText: string;
  symptoms: string;
  error: string;
};

export const EMPTY_FORM: FormValues = {
  title: "",
  purpose: "",
  stackText: "",
  workingText: "",
  symptoms: "",
  error: "",
};

export type FormField = keyof FormValues | "total";
export type FormResult = { ok: true; intake: Intake } | { ok: false; errors: Partial<Record<FormField, string>> };

/** Stack: comma or newline separated. Working features: one per line. Both are plain text, never commands. */
export function splitList(text: string, separators: RegExp): string[] {
  return text
    .split(separators)
    .map((s) => s.trim())
    .filter(Boolean);
}

const FIELD_OF: Record<string, keyof FormValues> = {
  title: "title",
  purpose: "purpose",
  stack: "stackText",
  working: "workingText",
  symptoms: "symptoms",
  error: "error",
};

export function parseForm(v: FormValues): FormResult {
  const r = intakeSchema.safeParse({
    title: v.title,
    purpose: v.purpose,
    stack: splitList(v.stackText, /[,\n]/),
    working: splitList(v.workingText, /\n/),
    symptoms: v.symptoms,
    error: v.error.replace(/\r\n?/g, "\n"),
  });
  if (r.success) return { ok: true, intake: r.data };

  const errors: Partial<Record<FormField, string>> = {};
  for (const issue of r.error.issues) {
    const key = typeof issue.path[0] === "string" ? issue.path[0] : undefined;
    const field = key ? FIELD_OF[key] : undefined;
    if (!field) {
      errors.total ??= `Total text is too long (at most ${LIMITS.total.toLocaleString("en")} characters across all fields).`;
      continue;
    }
    if (errors[field]) continue;
    errors[field] =
      issue.code === "too_small"
        ? "This field is required."
        : field === "stackText"
          ? `Use at most ${LIMITS.stackItems} items of ${LIMITS.stackItem} characters each.`
          : field === "workingText"
            ? `Use at most ${LIMITS.workingItems} lines of ${LIMITS.workingItem} characters each.`
            : "This is too long.";
  }
  return { ok: false, errors };
}

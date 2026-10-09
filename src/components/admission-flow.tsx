"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChartView } from "@/components/chart-view";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { describeFailure, postJson, type ApiFailure, type FailureView } from "@/lib/api-client";
import { buildEvidenceMap } from "@/lib/evidence";
import { EMPTY_FORM, parseForm, type FormField, type FormValues } from "@/lib/intake-form";
import { LIMITS, type Intake, type Question, type Report } from "@/lib/schemas";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type Mode = { state: "loading" } | { state: "sample" } | { state: "live"; termsVersion: string; privacyVersion: string };
type Phase = "form" | "admitted" | "questions" | "report";
type Busy = "session" | "triage" | "diagnose" | null;

const NOTICE =
  "Submit only information you own or are authorised to share. Do not paste secrets, personal/customer data, confidential client material, or full private code. Submitted text is sent to our AI provider for analysis. Results are provisional and require your review.";

export function AdmissionFlow() {
  const [mode, setMode] = useState<Mode>({ state: "loading" });
  const [phase, setPhase] = useState<Phase>("form");
  const [busy, setBusy] = useState<Busy>(null);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FormField, string>>>({});
  const [agreed, setAgreed] = useState(false);
  const [failure, setFailure] = useState<FailureView | null>(null);

  // Case data lives in React state only (browser memory) unless the visitor leaves it there.
  const [intake, setIntake] = useState<Intake | null>(null);
  const [caseId, setCaseId] = useState("");
  const [cdata, setCdata] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [ticket, setTicket] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [report, setReport] = useState<Report | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [challengeKey, setChallengeKey] = useState(0);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { mode?: string; termsVersion?: string; privacyVersion?: string }) => {
        if (cancelled) return;
        setMode(
          j.mode === "live" && j.termsVersion && j.privacyVersion
            ? { state: "live", termsVersion: j.termsVersion, privacyVersion: j.privacyVersion }
            : { state: "sample" },
        );
      })
      // A failed status check never blocks the samples; the live endpoints stay the authority.
      .catch(() => !cancelled && setMode({ state: "sample" }));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (failure) alertRef.current?.focus();
  }, [failure]);

  const hasCase = phase !== "form" || Object.values(form).some((v) => v.trim() !== "");
  const evidence = useMemo(
    () =>
      intake
        ? buildEvidenceMap(
            intake,
            questions.flatMap((q) => (answers[q.id]?.trim() ? [{ questionId: q.id, text: answers[q.id].trim() }] : [])),
          )
        : {},
    [intake, questions, answers],
  );

  /** A challenge token is single-use: always get a fresh widget after any submission. */
  const freshChallenge = () => {
    setToken(null);
    setChallengeKey((k) => k + 1);
  };

  const fail = (f: ApiFailure) => {
    setFailure(describeFailure(f));
    freshChallenge();
  };

  const confirmLeave = (e: React.MouseEvent) => {
    if (hasCase && !window.confirm("Leaving will clear your current case from this tab. Continue?")) e.preventDefault();
  };

  const resetAll = () => {
    setPhase("form");
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setAgreed(false);
    setFailure(null);
    setIntake(null);
    setCaseId("");
    setCdata("");
    setQuestions([]);
    setTicket("");
    setAnswers({});
    setReport(null);
    freshChallenge();
  };

  /* ---------- step 1: admission ---------- */
  const submitAdmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode.state !== "live" || busy || !token) return;
    setFailure(null);
    const parsed = parseForm(form);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});
    setBusy("session");
    const r = await postJson<{ caseId: string; cdata: string }>("/api/session", {
      turnstileToken: token,
      terms: { accepted: true, termsVersion: mode.termsVersion, privacyVersion: mode.privacyVersion },
    });
    setBusy(null);
    if (!r.ok) return fail(r);
    setIntake(parsed.intake);
    setCaseId(r.data.caseId);
    setCdata(r.data.cdata);
    setPhase("admitted");
    freshChallenge();
  };

  /* ---------- step 2: triage ---------- */
  const submitTriage = async () => {
    if (busy || !token || !intake) return;
    setFailure(null);
    setBusy("triage");
    const r = await postJson<{ questions: Question[]; ticket: string }>("/api/triage", {
      caseId,
      intake,
      turnstileToken: token,
    });
    setBusy(null);
    if (!r.ok) return fail(r);
    setQuestions(r.data.questions);
    setTicket(r.data.ticket);
    setPhase("questions");
    freshChallenge();
  };

  /* ---------- step 3: diagnosis ---------- */
  const submitDiagnosis = async () => {
    if (busy || !token || !intake) return;
    setFailure(null);
    setBusy("diagnose");
    const sent = questions.flatMap((q) => (answers[q.id]?.trim() ? [{ questionId: q.id, text: answers[q.id].trim() }] : []));
    const r = await postJson<{ report: Report }>("/api/diagnose", {
      caseId,
      intake,
      questions,
      answers: sent,
      ticket,
      turnstileToken: token,
    });
    setBusy(null);
    if (!r.ok) return fail(r);
    if (!r.data.report || !Array.isArray(r.data.report.recoveryTasks)) return fail({ ok: false, category: "unknown" });
    setReport(r.data.report);
    setPhase("report");
    freshChallenge();
  };

  const set = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  /* ---------- rendering ---------- */
  if (phase === "report" && report && intake) {
    return (
      <ChartView
        key={caseId}
        caseId={caseId}
        title={intake.title}
        intake={intake}
        report={report}
        evidence={evidence}
        provenance="live"
        onClear={resetAll}
      />
    );
  }

  const alert = failure && (
    <div ref={alertRef} tabIndex={-1} role="alert" data-testid="failure-alert" className="rounded-lg border border-destructive/50 p-4 text-sm">
      <p>{failure.message}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        {failure.offerSample && (
          <Link href="/" onClick={confirmLeave} className="font-medium underline">
            Explore a sample patient
          </Link>
        )}
        {!failure.canRetry && phase !== "form" && (
          <button type="button" className="font-medium underline" onClick={resetAll}>
            Start a new case
          </button>
        )}
      </div>
    </div>
  );

  if (mode.state === "loading") return <p role="status">Checking whether the hospital is open...</p>;

  if (mode.state === "sample") {
    return (
      <div className="space-y-4">
        <p
          role="status"
          className="rounded-lg border border-amber-500/50 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <strong>The hospital is busy.</strong> Live assessments are not switched on right now. You can still
          explore a fictional sample patient, check the evidence behind each finding, and download a plan.
        </p>
        <Link href="/" className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Explore a sample patient
        </Link>
      </div>
    );
  }

  if (phase === "admitted" || phase === "questions") {
    const isTriage = phase === "admitted";
    return (
      <div className="space-y-4">
        {alert}
        {isTriage ? (
          <section aria-labelledby="triage-h" className="space-y-3">
            <h2 id="triage-h" className="text-lg font-semibold">
              Triage
            </h2>
            <p className="text-sm">
              <strong>{intake?.title}</strong> has been admitted. The assistant will read what you wrote and ask up
              to three clarifying questions. Complete the check, then continue.
            </p>
          </section>
        ) : (
          <section aria-labelledby="q-h" className="space-y-4">
            <h2 id="q-h" className="text-lg font-semibold">
              {questions.length ? "A few clarifying questions" : "No clarifying questions needed"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Answer what you can with observations or redacted excerpts. Never include passwords, tokens or
              customer records. &quot;I don&apos;t know&quot; is a fine answer, and blank answers are skipped.
            </p>
            {questions.map((q) => (
              <div key={q.id} className="space-y-1">
                <label htmlFor={`ans-${q.id}`} className="block text-sm font-medium break-words">
                  {q.text}
                </label>
                <p className="text-xs text-muted-foreground break-words">Why it matters: {q.why}</p>
                <textarea
                  id={`ans-${q.id}`}
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  rows={3}
                  maxLength={LIMITS.answer}
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                />
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: "I don't know" }))}
                  >
                    I don&apos;t know
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {(answers[q.id] ?? "").length}/{LIMITS.answer}
                  </span>
                </div>
              </div>
            ))}
          </section>
        )}
        <TurnstileWidget
          key={`${phase}-${challengeKey}`}
          siteKey={SITE_KEY}
          action={isTriage ? "triage" : "diagnose"}
          cdata={cdata}
          onToken={setToken}
        />
        <div className="flex flex-wrap gap-2">
          <Button disabled={!token || busy !== null} onClick={isTriage ? submitTriage : submitDiagnosis}>
            {busy ? "Working..." : isTriage ? "Get clarifying questions" : "Create treatment plan"}
          </Button>
          <Button variant="outline" onClick={resetAll} disabled={busy !== null}>
            Clear case
          </Button>
        </div>
        {busy && (
          <p role="status" className="text-sm">
            The assistant is working. This usually takes a few seconds.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submitAdmission} noValidate className="space-y-5" aria-describedby="privacy-notice">
      <p id="privacy-notice" role="note" className="rounded-lg border p-4 text-sm">
        {NOTICE}
      </p>
      {alert}
      {fieldErrors.total && (
        <p role="alert" className="text-sm text-destructive">
          {fieldErrors.total}
        </p>
      )}

      <Field id="title" label="App title" error={fieldErrors.title} count={form.title.length} max={LIMITS.title}>
        <input id="title" className="w-full rounded-md border bg-background p-2 text-sm" maxLength={LIMITS.title} value={form.title} onChange={set("title")} aria-invalid={!!fieldErrors.title} />
      </Field>
      <Field id="purpose" label="What is the app meant to do?" error={fieldErrors.purpose} count={form.purpose.length} max={LIMITS.purpose}>
        <textarea id="purpose" rows={3} className="w-full rounded-md border bg-background p-2 text-sm" maxLength={LIMITS.purpose} value={form.purpose} onChange={set("purpose")} aria-invalid={!!fieldErrors.purpose} />
      </Field>
      <Field id="stack" label="Technology stack (comma separated)" error={fieldErrors.stackText}>
        <input id="stack" className="w-full rounded-md border bg-background p-2 text-sm" value={form.stackText} onChange={set("stackText")} aria-invalid={!!fieldErrors.stackText} />
      </Field>
      <Field id="working" label="What works today? (one per line)" error={fieldErrors.workingText}>
        <textarea id="working" rows={3} className="w-full rounded-md border bg-background p-2 text-sm" value={form.workingText} onChange={set("workingText")} aria-invalid={!!fieldErrors.workingText} />
      </Field>
      <Field id="symptoms" label="What fails or looks wrong?" error={fieldErrors.symptoms} count={form.symptoms.length} max={LIMITS.symptoms}>
        <textarea id="symptoms" rows={4} className="w-full rounded-md border bg-background p-2 text-sm" maxLength={LIMITS.symptoms} value={form.symptoms} onChange={set("symptoms")} aria-invalid={!!fieldErrors.symptoms} />
      </Field>
      <Field id="error" label="Redacted error excerpt (optional)" error={fieldErrors.error} count={form.error.length} max={LIMITS.error}>
        <textarea id="error" rows={4} className="w-full rounded-md border bg-background p-2 font-mono text-sm" maxLength={LIMITS.error} value={form.error} onChange={set("error")} aria-invalid={!!fieldErrors.error} />
      </Field>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 size-4" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>
          I agree to the{" "}
          <Link href="/terms" target="_blank" className="underline">
            Terms
          </Link>{" "}
          and have read the{" "}
          <Link href="/privacy" target="_blank" className="underline">
            Privacy Notice
          </Link>
          . I have permission to submit this information and have removed secrets and confidential/personal data.
        </span>
      </label>

      <TurnstileWidget key={`form-${challengeKey}`} siteKey={SITE_KEY} action="admission" onToken={setToken} />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!agreed || !token || busy !== null}>
          {busy ? "Admitting..." : "Admit my app"}
        </Button>
        <Link href="/" onClick={confirmLeave} className="self-center text-sm underline">
          Explore a sample patient instead
        </Link>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  count,
  max,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  count?: number;
  max?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      <div className="flex justify-between text-xs">
        <span role={error ? "alert" : undefined} className="text-destructive">
          {error}
        </span>
        {max !== undefined && (
          <span className="text-muted-foreground">
            {count}/{max}
          </span>
        )}
      </div>
    </div>
  );
}

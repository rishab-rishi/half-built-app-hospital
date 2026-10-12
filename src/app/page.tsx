import Link from "next/link";
import { FolderPreview } from "@/components/folder-preview";
import { QualityCard } from "@/components/quality-card";
import { buttonVariants } from "@/components/ui/button";
import { sampleCases } from "@/data/sample-cases";
import { loadConfig } from "@/lib/config";

/** Same availability rule as GET /api/status: live only when every prerequisite is met and the switch is on. */
function liveAdmissionsOpen(): boolean {
  try {
    return loadConfig(process.env).live;
  } catch {
    return false;
  }
}

// Display wording only. Case identities, routes and content come from the sample data.
const DISPLAY: Record<string, { label: string; headline: string }> = {
  "booking-double-reservations": { label: "Concurrency", headline: "The double reservation" },
  "storefront-payment-state": { label: "Payments", headline: "The uncertain payment" },
  "saas-portal-access": { label: "Access control", headline: "The crossed boundaries" },
};

const STRIP = ["Based on your description", "Clear steps to verify", "A plan you can take with you"];

const STEPS = [
  {
    name: "Describe",
    text: "Say what the app is for, what works, and what fails. Text only, with secrets and customer data removed.",
  },
  {
    name: "Understand",
    text: "Answer up to three clarifying questions, then read a provisional diagnosis that keeps what you reported apart from what is only a hypothesis.",
  },
  {
    name: "Verify",
    text: "Work through the recovery plan with its acceptance criteria. A task is verified only when you tick every check yourself.",
  },
];

const LIMITS = [
  "It reads only the text you provide. It does not inspect a repository, run code, or scan your app.",
  "Results are AI-generated, provisional, and can be wrong or incomplete.",
  "It is not a security audit, compliance check, or certification, and cannot say an app is safe to deploy.",
  "Anything involving authentication, payments, or data loss needs a qualified engineer, in staging first.",
];

export default function Home() {
  const live = liveAdmissionsOpen();

  return (
    <div className="space-y-20 sm:space-y-28">
      {/* Hero */}
      <section aria-labelledby="hero-heading" className="grid items-center gap-12 lg:grid-cols-[55fr_45fr] lg:gap-16">
        <div>
          <p className="label-mono">A little care for unfinished software</p>
          <h1
            id="hero-heading"
            className="display mt-5 text-[clamp(3.25rem,6.4vw,5.25rem)] leading-[0.96]"
          >
            Half-built.
            <br />
            Still <em>full of possibility.</em>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Turn what&apos;s going wrong into a clearer next step. Describe your app and get a provisional recovery
            plan grounded in the details you share.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {live ? (
              <>
                <Link href="/admission" className={buttonVariants({ size: "lg" })}>
                  Admit your app
                </Link>
                <Link href="/#samples" className={buttonVariants({ size: "lg", variant: "outline" })}>
                  Explore a sample chart
                </Link>
              </>
            ) : (
              <>
                <Link href="/#samples" className={buttonVariants({ size: "lg" })}>
                  Explore a sample chart
                </Link>
                <Link href="/admission" className={buttonVariants({ size: "lg", variant: "outline" })}>
                  Check admissions
                </Link>
              </>
            )}
          </div>
          <p className="mt-5 flex items-center gap-2.5 text-[0.9375rem] text-muted-foreground">
            <span aria-hidden className={`size-2 rounded-full ${live ? "bg-primary" : "bg-rust"}`} />
            {live ? "Live admissions open · Sample charts are open" : "Live admissions paused · Sample charts are open"}
          </p>
        </div>
        <FolderPreview />
      </section>

      {/* Three-part strip */}
      <section aria-label="What you get" className="-mt-6 border-y border-border sm:-mt-10">
        <ul className="grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
          {STRIP.map((s) => (
            <li key={s} className="display py-6 text-[1.5rem] leading-snug md:px-8 md:first:pl-0 md:last:pr-0">
              {s}
            </li>
          ))}
        </ul>
      </section>

      {/* Sample patients */}
      <section id="samples" aria-labelledby="patients-heading" className="scroll-mt-8">
        <p className="label-mono">The fictional ward</p>
        <h2 id="patients-heading" className="section-title mt-3">
          Meet three fictional patients
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          No sign-in, no AI calls. Each opens a full chart with evidence, a checklist, and a downloadable plan.
        </p>
        <ul className="mt-9 grid gap-5 md:grid-cols-3">
          {sampleCases.map((c, i) => {
            const d = DISPLAY[c.id] ?? { label: "Case", headline: c.name };
            return (
              <li key={c.id} className="paper flex flex-col p-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="label-mono">
                    No. {String(i + 1).padStart(2, "0")} · {d.label}
                  </p>
                  <p className="rounded-md border border-input px-2 py-0.5 font-mono text-[0.8125rem] uppercase tracking-wider text-muted-foreground">
                    Fictional
                  </p>
                </div>
                <h3 className="display mt-5 text-[2rem] leading-[1.05]">{d.headline}</h3>
                <p className="mt-1 text-[0.9375rem] break-words text-muted-foreground">{c.name}</p>
                <p className="mt-4 flex-1 break-words">{c.tagline}</p>
                <Link
                  href={`/chart/${c.id}`}
                  className="mt-5 inline-flex min-h-11 items-center gap-2 self-start font-medium text-foreground underline decoration-border decoration-2 underline-offset-[6px] transition-colors duration-150 hover:text-rust hover:decoration-rust"
                >
                  <span>
                    Open patient chart<span className="sr-only">: {c.name}</span>
                  </span>
                  <span aria-hidden>→</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* How it works */}
      <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-8">
        <p className="label-mono">How it works</p>
        <h2 id="how-heading" className="section-title mt-3">
          Describe, understand, verify
        </h2>
        <ol className="mt-9 grid gap-8 border-t border-border pt-8 md:grid-cols-3 md:gap-10">
          {STEPS.map((s, i) => (
            <li key={s.name}>
              <p className="font-mono text-[0.8125rem] tracking-wider text-rust">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="display mt-2 text-[2rem]">{s.name}</h3>
              <p className="mt-3 text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Limitations and evaluation */}
      <section id="limitations" aria-labelledby="limits-heading" className="scroll-mt-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div>
            <p className="label-mono">Read this first</p>
            <h2 id="limits-heading" className="section-title mt-3">
              What this can&apos;t do
            </h2>
            <ul className="mt-6 space-y-3">
              {LIMITS.map((l) => (
                <li key={l} className="flex gap-3">
                  <span aria-hidden className="mt-[0.7em] h-px w-4 shrink-0 bg-rust" />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/limitations"
              className="mt-5 inline-flex min-h-11 items-center font-medium underline decoration-border decoration-2 underline-offset-[6px] hover:decoration-rust"
            >
              Read every limitation
            </Link>
          </div>
          <div className="self-start">
            <QualityCard />
          </div>
        </div>
      </section>
    </div>
  );
}

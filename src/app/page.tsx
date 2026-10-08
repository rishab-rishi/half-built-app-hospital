import Link from "next/link";
import { QualityCard } from "@/components/quality-card";
import { sampleCases } from "@/data/sample-cases";

export default function Home() {
  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-bold sm:text-4xl">Half-Built App Hospital</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
          Describe an unfinished app and get a provisional recovery plan from the details you provide.
          It reads your text only: it does not scan, run, or certify anything.
        </p>
        <Link
          href="/admission"
          className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Admit your app
        </Link>
      </section>

      <section aria-labelledby="patients-heading">
        <h2 id="patients-heading" className="text-xl font-semibold">
          Meet the fictional patients
        </h2>
        <p className="text-sm text-muted-foreground">
          No sign-in, no AI calls. Each opens a full chart with evidence, a checklist, and a downloadable plan.
        </p>
        <ul className="mt-4 grid gap-4 md:grid-cols-3">
          {sampleCases.map((c) => (
            <li key={c.id} className="rounded-xl border bg-card p-4 text-card-foreground">
              <h3 className="font-semibold break-words">{c.name}</h3>
              <p className="mt-1 text-sm break-words text-muted-foreground">{c.tagline}</p>
              <Link href={`/chart/${c.id}`} className="mt-3 inline-block text-sm font-medium underline">
                Open chart for {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <QualityCard />
    </div>
  );
}

import { sampleCases } from "@/data/sample-cases";

/**
 * Hero illustration: a pale folder holding a paper chart, built from HTML and CSS. Every word comes from the
 * fictional booking sample, so nothing here is an invented result, and it is labelled as a sample.
 */
export function FolderPreview() {
  const c = sampleCases[0];
  const hypothesis = c.report.hypotheses[0];
  const steps = c.report.recoveryTasks.slice(0, 2);

  return (
    <figure className="relative mx-auto w-full max-w-[28.5rem] lg:ml-auto lg:mr-0" aria-labelledby="folder-caption">
      <div className="relative pt-9">
        {/* folder back and tab */}
        <div aria-hidden className="absolute inset-x-0 top-0 bottom-0 rounded-lg border border-border bg-olive" />
        <div aria-hidden className="absolute left-5 top-0 h-10 w-36 rounded-t-lg border border-b-0 border-border bg-olive" />
        {/* loose sheet peeking out behind the chart */}
        <div
          aria-hidden
          className="absolute inset-x-6 top-5 bottom-8 -rotate-2 rounded-md border border-border bg-paper"
        />

        {/* the chart */}
        <div className="relative mx-3 rounded-md border border-border bg-paper p-5 pb-16 shadow-[0_18px_34px_-18px_rgba(37,56,44,0.45)] sm:p-6 sm:pb-16">
          <div className="flex items-center justify-between gap-3">
            <p className="label-mono">Chart no. 01</p>
            <p className="inline-flex items-center rounded-md border border-[#e4c9b8] bg-rust-soft px-2 py-0.5 font-mono text-[0.8125rem] uppercase tracking-wider text-rust">
              Fictional sample
            </p>
          </div>
          <p className="display mt-3 text-[1.625rem] leading-[1.1]">{c.name}</p>

          <div className="mt-4 border-t border-border pt-3">
            <p className="label-mono">Reported symptom</p>
            <p className="mt-1 text-[0.9375rem] leading-snug">{c.tagline}</p>
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <p className="label-mono text-rust">Provisional hypothesis · not confirmed</p>
            <p className="mt-1 text-[0.9375rem] leading-snug">{hypothesis.text}</p>
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <p className="label-mono">Next steps to verify</p>
            <ol className="mt-1.5 space-y-1.5 text-[0.9375rem] leading-snug">
              {steps.map((s, i) => (
                <li key={s.title} className="flex gap-2.5">
                  <span aria-hidden className="font-mono text-muted-foreground">
                    {i + 1}.
                  </span>
                  <span>{s.title}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* folder front lip */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-11 rounded-b-lg border border-border bg-[#dfe5d3] shadow-[0_-6px_12px_-10px_rgba(37,56,44,0.5)]"
        />
      </div>
      <figcaption id="folder-caption" className="label-mono mt-4 text-center lg:text-right">
        Fictional sample · a preview of the booking chart
      </figcaption>
    </figure>
  );
}

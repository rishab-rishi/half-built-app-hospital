export const metadata = { title: "Security - Half-Built App Hospital" };

export default function SecurityPage() {
  return (
    <article className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Security contact</h1>
      <p role="note" className="rounded-lg border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        <strong>Draft.</strong> The reporting address below is a placeholder and must be set before live assessments
        are enabled.
      </p>
      <p>
        To report a vulnerability, email [PUBLIC CONTACT ADDRESS - to be set before launch]. Please describe what you
        found and how to reproduce it.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>Do not include live secrets, customer data, or anything that affects other visitors.</li>
        <li>Do not run load tests or automated abuse against the live service.</li>
        <li>Credible reports will get a reply. This is a personal demo, so there is no bounty programme.</li>
      </ul>
      <p className="text-sm text-muted-foreground">
        Reports about the source code can also be sent privately through the repository&apos;s security advisory form once
        the repository is public.
      </p>
    </article>
  );
}

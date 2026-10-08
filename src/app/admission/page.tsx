import Link from "next/link";

export default function AdmissionPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Admit your app</h1>
      <p role="note" className="rounded-lg border p-4 text-sm">
        Submit only information you own or are authorised to share. Do not paste secrets, personal/customer
        data, confidential client material, or full private code. Submitted text is sent to our AI provider
        for analysis. Results are provisional and require your review.
      </p>
      <p role="status" className="rounded-lg border border-amber-500/50 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        <strong>The hospital is busy.</strong> Live assessments are not switched on yet. You can still explore
        a fictional sample patient, check the evidence behind each finding, and download a plan.
      </p>
      <Link
        href="/"
        className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Explore a sample patient
      </Link>
    </div>
  );
}

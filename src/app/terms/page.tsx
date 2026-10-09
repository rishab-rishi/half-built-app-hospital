import { TERMS_VERSION } from "@/lib/policy";

export const metadata = { title: "Terms - Half-Built App Hospital" };

export default function TermsPage() {
  return (
    <article className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Terms</h1>
      <p role="note" className="rounded-lg border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        <strong>Draft for review.</strong> Not yet reviewed by a lawyer, and live assessments stay off until the
        final text and contact address are published.
      </p>
      <p className="text-sm text-muted-foreground">
        Version {TERMS_VERSION}. Operator: Rishab Chowdary. Contact: [PUBLIC CONTACT ADDRESS - to be set before launch].
      </p>
      <p>
        Half-Built App Hospital is an experimental software-planning demo operated by Rishab Chowdary. It produces
        provisional suggestions from information you supply. It does not inspect or execute your application, perform
        a security audit, certify compliance, or guarantee correctness or fitness for a particular purpose.
      </p>
      <p>
        You must have permission to submit the material you provide. Do not submit credentials, personal/customer
        records, confidential client material, or content that violates another person&apos;s rights. You retain your
        rights in submitted material; you permit the processing needed to provide the assessment, as described in the
        Privacy Notice.
      </p>
      <p>
        AI-generated results may be inaccurate, incomplete, or misleading. Independently review every recommendation,
        preserve appropriate backups, and test changes in a separate environment. Do not rely on this demo for
        safety-critical decisions or as the sole basis for security, compliance, financial, or production-release
        decisions.
      </p>
      <p>
        Do not automate abusive submissions, bypass challenges or quotas, attempt unauthorised access, or interfere
        with the service. We may limit or suspend live access to protect the service. Availability and continued free
        access are not guaranteed.
      </p>
      <p>
        To the fullest extent permitted by applicable law, the service and results are provided as available and
        without warranties, and the operator disclaims liability arising from reliance on the demo. Nothing in these
        terms excludes liability or rights that applicable law does not allow to be excluded. The source-code license
        is separate from these website terms.
      </p>
    </article>
  );
}

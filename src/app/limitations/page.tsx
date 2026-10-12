export const metadata = { title: "Limitations - Half-Built App Hospital" };

export default function LimitationsPage() {
  return (
    <article className="policy">
      <h1>Limitations</h1>
      <ul>
        <li>The demo reads only the text you provide. It does not inspect your repository, run your code, or scan your app.</li>
        <li>Results are AI-generated, provisional, and can be wrong or incomplete. Review every suggestion yourself.</li>
        <li>Findings that point to supplied evidence are still based on information that has not been independently verified.</li>
        <li>It is not a security audit, compliance check, or certification, and it cannot tell you an app is safe to deploy.</li>
        <li>Anything involving authentication, payments, or data loss should be checked by a qualified engineer, in staging first.</li>
        <li>&quot;Verified&quot; on the recovery board means you confirmed the checks yourself.</li>
        <li>
          Live assessments have per-visitor and site-wide limits. Daily limits reset at 00:00 UTC and monthly limits on
          the 1st of each month (UTC). Shared networks can reach a limit sooner. The sample patients are always available.
        </li>
      </ul>
    </article>
  );
}

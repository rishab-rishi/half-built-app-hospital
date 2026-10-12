import { PRIVACY_VERSION } from "@/lib/policy";

export const metadata = { title: "Privacy - Half-Built App Hospital" };

export default function PrivacyPage() {
  return (
    <article className="policy">
      <h1>Privacy Notice</h1>
      <p role="note" className="notice">
        <strong>Draft for review.</strong> Items in [brackets] are not yet verified against the deployed system and
        must be confirmed before live assessments are enabled.
      </p>
      <p className="meta">
        Version {PRIVACY_VERSION}. Contact: [PUBLIC CONTACT ADDRESS - to be set before launch].
      </p>
      <p>
        We process the app details and answers you submit to generate an assessment through Groq. We do not
        intentionally store case text or generated reports in our application database. The browser holds the case
        temporarily. Redis stores short-lived session, integrity, acceptance, and abuse-prevention records. Our
        hosting and challenge providers may process connection and operational metadata. Downloaded reports and
        records held by third parties are outside the <em>Clear case</em> function.
      </p>
      <h2>What is stored, and for how long</h2>
      <ul>
        <li>Your intake, answers and report: in your browser tab&apos;s memory until you clear them or leave the page.</li>
        <li>Session and accepted policy versions: Redis (Upstash), at most 24 hours.</li>
        <li>Case state and integrity hashes (not your text): Redis, about 30 minutes.</li>
        <li>Rate-limit counters keyed by a keyed hash of your IP address and your session: Redis, for the limit window plus a short cleanup period. A keyed hash is pseudonymous, not anonymous.</li>
        <li>Aggregate daily and monthly usage counters with no case content: Redis, until shortly after the period ends.</li>
        <li>Operational logs hold a request ID, stage, outcome, latency and token totals only, never your text, cookies or IP address. [Host log retention period to be confirmed.]</li>
      </ul>
      <h2>Providers</h2>
      <ul>
        <li>Vercel: hosting and connection metadata.</li>
        <li>Groq: receives the text you submit to produce the assessment. [Data-retention setting to be verified in the account before launch.]</li>
        <li>Upstash: Redis for the short-lived records above.</li>
        <li>Cloudflare Turnstile: human check; processes connection and browser signals.</li>
      </ul>
      <p>
        These providers may process data outside your country. [Links to each provider&apos;s current privacy policy to
        be added before launch.]
      </p>
    </article>
  );
}

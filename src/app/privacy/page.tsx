import { PRIVACY_VERSION } from "@/lib/policy";
import { SAVED_CASE_KEY } from "@/lib/saved-case";
import { cookieName } from "@/lib/sessions";

// Named from the code that sets them, so the notice cannot drift from what the site actually stores.
const SESSION_COOKIE = cookieName(true);

export const metadata = { title: "Privacy - Half-Built App Hospital" };

const CONTACT = "cold.start001@gmail.com";

export default function PrivacyPage() {
  return (
    <article className="policy">
      <h1>Privacy Notice</h1>
      <p role="note" className="notice">
        <strong>Draft for review.</strong> Not yet reviewed by a lawyer. Any item in [brackets] has not yet been
        confirmed against the deployed system.
      </p>
      <p className="meta">
        Version {PRIVACY_VERSION}. Contact for privacy questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
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
      <h2>Cookies and browser storage</h2>
      <p>
        This site uses no analytics, advertising or tracking cookies, so there is no cookie banner. What it does use:
      </p>
      <ul>
        <li>
          <strong>
            <code>{SESSION_COOKIE}</code>
          </strong>
          : one strictly necessary cookie, set only when you start a live assessment. It links the steps of your
          assessment together and enforces the abuse limits; assessments cannot work without it. It is
          secure-only, cannot be read by page scripts, is sent only to this site, and expires after at most 24
          hours. Browsing the sample patients sets no cookie.
        </li>
        <li>
          <strong>
            <code>{SAVED_CASE_KEY}</code>
          </strong>
          : browser session storage, used only if you tick <em>Remember in this tab</em> (off by default). It keeps
          your case in this tab so a refresh does not lose it. It stays on your device and is removed by{" "}
          <em>Clear case</em> or by turning the option off.
        </li>
        <li>
          Cloudflare Turnstile, the human check on the admissions page, runs Cloudflare&apos;s own script. What it
          collects and stores is described in Cloudflare&apos;s{" "}
          <a href="https://www.cloudflare.com/turnstile-privacy-policy/">Turnstile privacy addendum</a>.
        </li>
      </ul>
      <h2>Providers</h2>
      <ul>
        <li>
          Vercel: hosting and connection metadata.{" "}
          <a href="https://vercel.com/legal/privacy-notice">Privacy notice</a>.
        </li>
        <li>
          Groq: receives the text you submit to produce the assessment. Zero Data Retention is enabled for inference
          on our Groq account (checked in the account on 14 October 2026), so Groq is configured not to store the
          inputs and outputs. Groq still collects usage metadata, such as token counts.{" "}
          <a href="https://groq.com/privacy-policy">Privacy policy</a>.
        </li>
        <li>
          Upstash: Redis for the short-lived records above.{" "}
          <a href="https://upstash.com/trust/privacy.pdf">Privacy policy (PDF)</a>.
        </li>
        <li>
          Cloudflare Turnstile: human check; processes connection and browser signals.{" "}
          <a href="https://www.cloudflare.com/privacypolicy/">Privacy policy</a>.
        </li>
      </ul>
      <p>
        These providers may process data outside your country. Their own policies describe how they handle data;
        they can change, so check them for the current terms.
      </p>
    </article>
  );
}

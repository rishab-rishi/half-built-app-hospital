export const metadata = { title: "Security - Half-Built App Hospital" };

export default function SecurityPage() {
  return (
    <article className="policy">
      <h1>Security contact</h1>
      <p>
        To report a vulnerability, email <a href="mailto:cold.start001@gmail.com">cold.start001@gmail.com</a>. Please describe what you
        found and how to reproduce it.
      </p>
      <ul>
        <li>Do not include live secrets, customer data, or anything that affects other visitors.</li>
        <li>Do not run load tests or automated abuse against the live service.</li>
        <li>Credible reports will get a reply. This is a personal demo, so there is no bounty programme.</li>
      </ul>
      <p className="meta">
        Reports about the source code can also be sent privately through the repository&apos;s security advisory form once
        the repository is public.
      </p>
    </article>
  );
}

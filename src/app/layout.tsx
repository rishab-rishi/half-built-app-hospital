import type { Metadata } from "next";
import Link from "next/link";
import { DM_Mono, DM_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

// Pages render per request so the Content-Security-Policy nonce can be applied to every script.
export const dynamic = "force-dynamic";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Half-Built App Hospital",
  description:
    "Describe an unfinished app and get a provisional, evidence-linked recovery plan. Explore fictional patients without signing in.",
};

/** A plain monochrome cross: the only medical cue in the interface. */
function CrossMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M12 3.5v17M3.5 12h17" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" />
    </svg>
  );
}

const NAV = [
  { href: "/#samples", label: "Sample patients" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/limitations", label: "Limitations" },
];

const POLICIES = [
  { href: "/admission", label: "Admissions" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/limitations", label: "Limitations" },
  { href: "/security", label: "Security" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${dmSans.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <header className="border-b border-border">
          <nav aria-label="Main" className="wrap flex flex-wrap items-center justify-between gap-x-6 gap-y-0 py-2">
            <Link href="/" className="inline-flex min-h-11 items-center gap-2.5 text-foreground no-underline">
              <CrossMark />
              <span className="text-[1.0625rem] font-medium tracking-tight">Half-Built App Hospital</span>
            </Link>
            <ul className="-mx-3 flex flex-wrap items-center sm:mx-0">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="nav-link">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        <main id="main" className="wrap flex-1 py-10 sm:py-14">
          {children}
        </main>
        <footer className="mt-8 border-t border-border">
          <div className="wrap flex flex-col gap-4 py-8 md:flex-row md:items-start md:justify-between md:gap-12">
            <p className="max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground">
              Provisional, AI-assisted suggestions from supplied text only. Not a security audit or certification.
            </p>
            <nav aria-label="Policies">
              <ul className="-mx-3 flex flex-wrap md:justify-end">
                {POLICIES.map((p) => (
                  <li key={p.href + p.label}>
                    <Link href={p.href} className="nav-link">
                      {p.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}

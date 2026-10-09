import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Pages render per request so the Content-Security-Policy nonce can be applied to every script.
export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Half-Built App Hospital",
  description:
    "Describe an unfinished app and get a provisional, evidence-linked recovery plan. Explore fictional patients without signing in.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-background focus:p-2"
        >
          Skip to content
        </a>
        <header className="border-b">
          <nav
            aria-label="Main"
            className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3"
          >
            <Link href="/" className="font-semibold">
              Half-Built App Hospital
            </Link>
            <div className="flex gap-4 text-sm">
              <Link href="/admission">Admit your app</Link>
              <Link href="/limitations">Limitations</Link>
            </div>
          </nav>
        </header>
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground">
          <p>Provisional, AI-assisted suggestions from supplied text only. Not a security audit or certification.</p>
          <nav aria-label="Policies" className="mt-2 flex flex-wrap justify-center gap-4">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/limitations">Limitations</Link>
            <Link href="/security">Security</Link>
          </nav>
        </footer>
      </body>
    </html>
  );
}

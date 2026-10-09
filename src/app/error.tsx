"use client";

import Link from "next/link";

// Shows a fixed message only: error details can contain case text, so they are never rendered or logged here.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="max-w-2xl space-y-3">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p>The page hit a problem. Nothing was sent anywhere. You can try again or explore a sample patient.</p>
      <div className="flex gap-3">
        <button type="button" onClick={reset} className="rounded-md border px-4 py-2 text-sm font-medium">
          Try again
        </button>
        <Link href="/" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Explore a sample patient
        </Link>
      </div>
    </div>
  );
}

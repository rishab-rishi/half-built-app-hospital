"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

// Shows a fixed message only: error details can contain case text, so they are never rendered or logged here.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="policy">
      <p className="label-mono">Something went wrong</p>
      <h1>The page hit a problem</h1>
      <p>Nothing was sent anywhere. You can try again or explore a sample patient.</p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" size="lg" onClick={reset}>
          Try again
        </Button>
        <Link href="/#samples" className={buttonVariants({ size: "lg" })}>
          Explore a sample patient
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-2xl space-y-3">
      <h1 className="text-2xl font-bold">That page is not in the hospital</h1>
      <p>We could not find what you were looking for.</p>
      <Link href="/" className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        Back to the patients
      </Link>
    </div>
  );
}

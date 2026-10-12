import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="policy">
      <p className="label-mono">Error 404</p>
      <h1>That page is not in the hospital</h1>
      <p>We could not find what you were looking for.</p>
      <p>
        <Link href="/" className={buttonVariants({ size: "lg" })}>
          Back to the patients
        </Link>
      </p>
    </div>
  );
}

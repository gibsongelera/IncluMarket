"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * What a route error boundary shows. Generic on purpose: in production Next.js
 * strips server error text and passes only a digest, and a raw database error
 * would mean nothing to a buyer anyway. The digest is shown so support can
 * find the server log line.
 */
export function ErrorState({
  error,
  reset,
  homeHref = "/home",
  homeLabel = "Go to the shop",
  inShell = false,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref?: string;
  homeLabel?: string;
  /** Inside the Seller Centre / Admin shell, which already has a container. */
  inShell?: boolean;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" tabIndex={-1} className={`${inShell ? "" : "container "}page-state`}>
      <h1>We can&apos;t load this page right now</h1>
      <p>
        Something went wrong on our side while loading this page. Nothing you saved was lost.
        Please try again in a moment.
      </p>
      <div className="form-actions">
        <button type="button" className="btn btn--primary" onClick={reset}>
          Try again
        </button>
        <Link href={homeHref} className="btn btn--ghost">
          {homeLabel}
        </Link>
      </div>
      {error.digest ? <p className="muted small">Reference code: {error.digest}</p> : null}
    </main>
  );
}

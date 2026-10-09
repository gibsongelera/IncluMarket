"use client";

import Link from "next/link";
import { useEffect } from "react";

// Route-level error boundary. Renders inside the root layout, so the theme,
// skip link, toasts and floating widgets stay available. The message is
// deliberately generic: in production Next.js strips server error text and
// only passes a digest, and a raw database error would mean nothing to a
// buyer anyway. The digest is shown so support can find the server log line.
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" tabIndex={-1} className="container page-state">
      <h1>We can&apos;t load this page right now</h1>
      <p>
        Something went wrong on our side while loading this page. Your cart and
        your orders are safe. Please try again in a moment.
      </p>
      <div className="form-actions">
        <button type="button" className="btn btn--primary" onClick={reset}>
          Try again
        </button>
        <Link href="/home" className="btn btn--ghost">
          Go to the shop
        </Link>
      </div>
      {error.digest ? <p className="muted small">Reference code: {error.digest}</p> : null}
    </main>
  );
}

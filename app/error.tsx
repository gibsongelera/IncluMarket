"use client";

import { ErrorState } from "@/components/ErrorState";

// Route-level error boundary for everything outside the Seller Centre and
// Admin shells (those have their own, so their sidebar stays). Renders inside
// the root layout: theme, skip link, toasts and floating widgets stay.
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState error={error} reset={reset} />;
}

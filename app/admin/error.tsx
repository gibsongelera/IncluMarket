"use client";

import { ErrorState } from "@/components/ErrorState";

// Keeps the admin header and sidebar when one page fails.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState error={error} reset={reset} homeHref="/admin" homeLabel="Go to the overview" inShell />;
}

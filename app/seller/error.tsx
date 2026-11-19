"use client";

import { ErrorState } from "@/components/ErrorState";

// Keeps the Seller Centre header and sidebar when one page fails.
export default function SellerError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState error={error} reset={reset} homeHref="/seller/dashboard" homeLabel="Go to the dashboard" inShell />;
}

"use client";

/** Opens the browser's print dialog. */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" className="btn btn--primary no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}

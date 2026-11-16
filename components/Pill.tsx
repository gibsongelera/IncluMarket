// Status pill, matches ui.pillFor(): <span class="pill pill--<status>">.
// The colour always comes from the status; `label` gives its words where a
// page has its own for it (Seller Centre → Products: "flagged" reads
// "Needs changes", as its tab does).
export function Pill({ status, label }: { status: string; label?: string }) {
  const words = label ?? (status ? status.replace(/_/g, " ") : "");
  return <span className={`pill pill--${status}`}>{words}</span>;
}

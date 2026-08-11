// Status pill, matches ui.pillFor(): <span class="pill pill--<status>">.
export function Pill({ status }: { status: string }) {
  const label = status ? status.replace(/_/g, " ") : "";
  return <span className={`pill pill--${status}`}>{label}</span>;
}

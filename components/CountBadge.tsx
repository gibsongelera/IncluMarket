/** A count next to a nav link, with words for screen readers ("3 saved"). */
export function CountBadge({ count, label }: { count: number; label: string }) {
  return (
    <span className="badge badge--yellow">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

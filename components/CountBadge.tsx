/** A count next to a nav link, with words for screen readers ("3 saved"). */
export function CountBadge({ count, label }: { count: number; label: string }) {
  return (
    <span className="badge badge--yellow">
      {/* A space before the number, so the link's name is "Cart 2 in cart"
          and not "Cart2", whatever the layout. Not drawn: leading white
          space in a flex box is dropped. */}
      {" "}
      {count > 99 ? "99+" : count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

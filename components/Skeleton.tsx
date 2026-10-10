/**
 * Loading skeletons for app/**\/loading.tsx.
 *
 * Server components, no JavaScript, no animation: plain neutral blocks shaped
 * like the page that is coming, inside a role="status" region that tells a
 * screen reader what is loading. A page used to show nothing at all while its
 * data loaded (B-18).
 */

function Status({ label }: { label: string }) {
  return <p className="sr-only">{label}</p>;
}

export function GridSkeleton({ label = "Loading products…", cards = 8, wide = false }: { label?: string; cards?: number; wide?: boolean }) {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <Status label={label} />
      <div className="skeleton__block skeleton__line skeleton__line--title" aria-hidden="true" />
      <div className={`product-grid${wide ? " product-grid--wide" : ""}`} aria-hidden="true">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="skeleton__block skeleton__card" />
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ label = "Loading…", rows = 6 }: { label?: string; rows?: number }) {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <Status label={label} />
      <div className="skeleton__block skeleton__line skeleton__line--title" aria-hidden="true" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton__block skeleton__row" aria-hidden="true" />
      ))}
    </div>
  );
}

export function DetailSkeleton({ label = "Loading product…" }: { label?: string }) {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <Status label={label} />
      <div className="skeleton__split" aria-hidden="true">
        <div className="skeleton__block skeleton__media" />
        <div className="skeleton">
          <div className="skeleton__block skeleton__line skeleton__line--title" />
          <div className="skeleton__block skeleton__line skeleton__line--short" />
          <div className="skeleton__block skeleton__line" />
          <div className="skeleton__block skeleton__line" />
          <div className="skeleton__block skeleton__row" />
        </div>
      </div>
    </div>
  );
}

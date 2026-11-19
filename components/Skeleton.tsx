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

/**
 * /home (app/home/loading.tsx), in the page's order: the hero, a row of
 * category circles, then a rail of cards. The cards sit in the rail's own
 * track (.rail-scroller--rail .rail__track), so they take its columns at
 * every width; heights are rem or ratios, so nothing shifts sideways.
 */
export function HomeSkeleton({ label = "Loading the shop…" }: { label?: string }) {
  return (
    <div className="skeleton skeleton--home" role="status" aria-live="polite">
      <Status label={label} />
      <div className="skeleton__block skeleton__hero" aria-hidden="true" />
      <div className="skeleton__block skeleton__line skeleton__line--title" aria-hidden="true" />
      <div className="skeleton__tiles" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton__block skeleton__circle" />
        ))}
      </div>
      <div className="skeleton__block skeleton__line skeleton__line--title" aria-hidden="true" />
      <div className="rail-scroller rail-scroller--rail product-rail" aria-hidden="true">
        <div className="rail__track">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="rail__item">
              <div className="skeleton__block skeleton__card" />
            </div>
          ))}
        </div>
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

/**
 * A dashboard (app/admin/loading.tsx for the overview): the page head, a
 * row of KPI tiles and `rows` rows of an 8 + 4 card pair. The blocks sit in
 * the page's own grids, .kpis and .dash-grid, so they take the columns the
 * page will at every console width (container queries in responsive.css),
 * and every height is in rem, so nothing shifts sideways at 320px.
 */
export function DashboardSkeleton({ label = "Loading…", tiles = 4, rows = 2 }: { label?: string; tiles?: number; rows?: number }) {
  return (
    <div className="skeleton skeleton--dashboard" role="status" aria-live="polite">
      <Status label={label} />
      <div className="skeleton__head" aria-hidden="true">
        <div className="skeleton__block skeleton__line skeleton__line--title" />
        <div className="skeleton__block skeleton__line skeleton__line--short" />
      </div>
      <div className="kpis" aria-hidden="true">
        {Array.from({ length: tiles }, (_, i) => (
          <div key={i} className="skeleton__block skeleton__tile" />
        ))}
      </div>
      <div className="dash-grid" aria-hidden="true">
        {Array.from({ length: rows * 2 }, (_, i) => (
          <div key={i} className={`skeleton__block skeleton__panel ${i % 2 ? "span-4" : "span-8"}`} />
        ))}
      </div>
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

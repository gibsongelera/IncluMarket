"use client";

import { useEffect, useState } from "react";

const KEY = "im_search_filters";

/**
 * The /search frame: the filter panel and the results. The panel collapses
 * on every screen size; on a phone it starts collapsed so products come
 * first, and on a desktop collapsing it gives the grid a fifth column (M-08:
 * the columns change instantly, only the panel body fades in). The choice is
 * remembered in this browser only.
 */
export function SearchLayout({
  filters,
  activeCount,
  children,
}: {
  filters: React.ReactNode;
  activeCount: number;
  children: React.ReactNode;
}) {
  // Server render: open, so a visitor without JavaScript sees every filter.
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setOpen(false);
      return;
    }
    try {
      if (localStorage.getItem(KEY) === "collapsed") setOpen(false);
    } catch {}
  }, []);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      if (!window.matchMedia("(max-width: 767px)").matches) {
        try {
          localStorage.setItem(KEY, next ? "open" : "collapsed");
        } catch {}
      }
      return next;
    });
  }

  return (
    <div className={`search-layout${open ? "" : " search-layout--collapsed"}`}>
      <aside className={`filters${open ? "" : " filters--collapsed"}`} aria-labelledby="filters-title">
        <div className="filters__head">
          <h2 id="filters-title">Filters</h2>
          <button
            type="button"
            className="filters__toggle btn btn--ghost btn--sm"
            aria-expanded={open}
            aria-controls="filters-body"
            onClick={toggle}
          >
            {open ? "Hide" : "Show"}
            <span className="sr-only"> filters</span>
            {activeCount > 0 ? (
              <span className="filters__count">
                {activeCount}
                <span className="sr-only"> active</span>
              </span>
            ) : null}
          </button>
        </div>
        <div className="filters__body" id="filters-body">
          {filters}
        </div>
      </aside>
      <div className="search-results">{children}</div>
    </div>
  );
}

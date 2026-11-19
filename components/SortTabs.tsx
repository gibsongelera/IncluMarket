"use client";

import { useRouter } from "next/navigation";
import { SORTS, type SortKey } from "@/lib/storefront-core";

/**
 * Relevance · Latest · Top sales · Price, as a radio group (C-16). The sort
 * lives in the URL and runs on the server, so it orders every page, not just
 * the cards already loaded. Choosing one navigates at once; without
 * JavaScript the form's Sort button submits the same URL.
 */
export function SortTabs({
  action,
  current,
  params,
  withRelevance,
}: {
  /** Path the form submits to, e.g. "/home". */
  action: string;
  current: SortKey;
  /** Every other query param, kept as it is (page resets to 1). */
  params: Record<string, string>;
  withRelevance: boolean;
}) {
  const router = useRouter();
  const options = SORTS.filter((s) => withRelevance || s.key !== "relevance");

  function go(sort: SortKey) {
    const p = new URLSearchParams(params);
    p.delete("page");
    const dflt = withRelevance ? "relevance" : "latest";
    if (sort === dflt) p.delete("sort");
    else p.set("sort", sort);
    const qs = p.toString();
    router.push(qs ? `${action}?${qs}` : action, { scroll: false });
  }

  return (
    <form className="sort-tabs" action={action} method="get" onSubmit={(e) => e.preventDefault()}>
      {Object.entries(params)
        .filter(([k]) => k !== "sort" && k !== "page")
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      <fieldset className="sort-tabs__group">
        <legend className="sort-tabs__legend">Sort by</legend>
        {options.map((s) => (
          <label key={s.key} className={`sort-tab${s.key === current ? " sort-tab--current" : ""}`}>
            <input
              type="radio"
              name="sort"
              value={s.key}
              checked={s.key === current}
              onChange={() => go(s.key)}
            />
            <span>{s.label}</span>
          </label>
        ))}
      </fieldset>
      <noscript>
        <button type="submit" className="btn btn--outline btn--sm">
          Sort
        </button>
      </noscript>
    </form>
  );
}

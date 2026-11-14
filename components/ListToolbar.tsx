import Link from "next/link";
import { Icon } from "./Icon";
import {
  DEFAULT_PER_PAGE,
  KEPT_PARAMS,
  SEARCH_MAX,
  listHref,
  type KeptParam,
  type ListParams,
} from "@/lib/list-params";

/** A count with thousands separators ("1,250"). */
const num = (n: number) => n.toLocaleString("en-PH");

export interface ListTab {
  /** The filter's value in the URL; null is the tab with no filter ("All"). */
  value: string | null;
  label: string;
  /** Rows in this tab; null shows no number (it could not be read). */
  count: number | null;
}

export interface ListToolbarProps {
  /** The list's own path ("/admin/orders"); the tabs, the search and Clear search all go back to it. */
  path: string;
  params: ListParams;
  tabs?: readonly ListTab[];
  /** The query parameter the tabs set. */
  tabParam?: KeptParam;
  /** The tabs' nav name; "Show orders" for noun ["order", "orders"]. */
  tabsLabel?: string;
  /** The search box: its visible label ("Search orders") and an optional hint inside the field. */
  search?: { label: string; placeholder?: string };
  /** A link to the matching report in /admin/reports, where one exists (03 §6). */
  exportHref?: string;
  exportLabel?: string;
  /** Rows matching the current tab and search, across every page. */
  total: number;
  /** [singular, plural]: ["order", "orders"]. */
  noun: readonly [string, string];
}

/**
 * The band above an admin list (ADR-05, 03 §6, 01 §6.3): status tabs with
 * counts, the search box, Export, and the result count in words. Plain links
 * and a GET form, so it works without JavaScript; a server component.
 *
 * - Tabs are links (aria-current="page" on the current one) in a named nav,
 *   with the .tabs / .tab classes of app/notifications. A tab keeps the
 *   search and the page size and goes back to page 1 (listHref). The current
 *   tab is the one whose value is in the URL, else the null-valued one (a
 *   list ignores a filter value it does not know, so it shows them all).
 * - The search is <form role="search" method="get">, named by its visible
 *   label (the header has a search landmark too). Hidden inputs keep the
 *   list's filters and a non-default page size; there is no page input, so
 *   a new search starts at page 1. "Clear search" shows while there is one.
 * - The count is a status line, so a screen reader hears it change after a
 *   client-side tab change: "213 orders", "1 order", "No orders"; with a
 *   search, "12 orders match “maria”" or "No orders match “maria”".
 */
export function ListToolbar({
  path,
  params,
  tabs,
  tabParam = "status",
  tabsLabel,
  search,
  exportHref,
  exportLabel = "Export",
  total,
  noun,
}: ListToolbarProps) {
  const [one, many] = noun;
  const inUrl = params.filters[tabParam] ?? null;
  const currentTab = tabs?.find((t) => t.value === inUrl) ?? tabs?.find((t) => t.value === null) ?? null;
  // One toolbar per page, so the path gives a unique, stable id.
  const searchId = `list-search${path.replace(/[^a-z0-9]+/gi, "-")}`;

  return (
    <div className="list-toolbar">
      {tabs?.length ? (
        <nav className="tabs" aria-label={tabsLabel ?? `Show ${many}`}>
          {tabs.map((t) => {
            const current = t === currentTab;
            return (
              <Link
                key={t.value ?? ""}
                href={listHref(path, params, { [tabParam]: t.value })}
                className={`tab${current ? " tab--active" : ""}`}
                aria-current={current ? "page" : undefined}
              >
                {t.label}
                {t.count !== null ? (
                  <>
                    {/* The space keeps "Pending 12" apart in the link's
                        name; the flex gap spaces it on screen. */}{" "}
                    <span className="tab__count">{num(t.count)}</span>
                  </>
                ) : null}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {search || exportHref ? (
        <div className="list-toolbar__row">
          {search ? (
            <form
              className="list-toolbar__search"
              role="search"
              method="get"
              action={path}
              aria-labelledby={`${searchId}-label`}
            >
              <label id={`${searchId}-label`} htmlFor={searchId}>
                {search.label}
              </label>
              <div className="list-toolbar__field">
                <input
                  id={searchId}
                  type="search"
                  name="q"
                  defaultValue={params.q}
                  maxLength={SEARCH_MAX}
                  placeholder={search.placeholder}
                  autoComplete="off"
                />
                {KEPT_PARAMS.map((key) =>
                  params.filters[key] ? (
                    <input key={key} type="hidden" name={key} value={params.filters[key]} />
                  ) : null
                )}
                {params.perPage !== DEFAULT_PER_PAGE ? (
                  <input type="hidden" name="per" value={params.perPage} />
                ) : null}
                <button type="submit" className="btn btn--primary">
                  <Icon name="search" />
                  Search
                </button>
                {params.q ? (
                  <Link className="list-toolbar__clear" href={listHref(path, params, { q: null })}>
                    Clear search
                  </Link>
                ) : null}
              </div>
            </form>
          ) : null}
          {exportHref ? (
            <Link className="btn btn--outline list-toolbar__export" href={exportHref}>
              <Icon name="download" />
              {exportLabel}
            </Link>
          ) : null}
        </div>
      ) : null}

      <p className="list-toolbar__count" role="status">
        {countWords(total, one, many, params.q)}
      </p>
    </div>
  );
}

/** "213 orders", "1 order", "No orders"; with a search, "12 orders match “maria”" or "No orders match “maria”". */
function countWords(total: number, one: string, many: string, q: string): string {
  const n = Math.max(0, Math.floor(total));
  const rows = n === 0 ? `No ${many}` : `${num(n)} ${n === 1 ? one : many}`;
  if (!q) return rows;
  return `${rows} ${n === 1 ? "matches" : "match"} “${q}”`;
}

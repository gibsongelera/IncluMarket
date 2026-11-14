import Link from "next/link";
import { Fragment } from "react";
import { PER_PAGE, listHref, pageCount, pageItems, type ListParams } from "@/lib/list-params";

/** A count with thousands separators ("1,250"). */
const num = (n: number) => n.toLocaleString("en-PH");

export interface PaginationProps {
  /** The list's own path ("/admin/orders"); every link is a listHref of it. */
  path: string;
  params: ListParams;
  /** Rows matching the list's filter and search, across every page. */
  total: number;
  /** The nav's name; "Pages" unless a page has two lists. */
  label?: string;
}

/**
 * The band under an admin list (ADR-05, 03 §6): "Showing 26–50 of 213",
 * Previous / Next with numbered pages between them, and the page size. Plain
 * links, so it works without JavaScript; a server component.
 *
 * - Every link is a listHref, so the filter (?status, ?view, ?role), the
 *   search and the page size carry over; a new page size starts at page 1.
 * - The current page and page size are not links: aria-current, brand blue
 *   with white text and heavier type. Previous at page 1 and Next at the
 *   last page are links with no href (not focusable), aria-disabled, muted.
 * - The numbers ("1 … 4 5 6 … 20") show from 32rem of console content; below
 *   it they give way to "Page 3 of 20" between Previous and Next, which goes
 *   on its own line above them below 18rem (container queries in
 *   responsive.css). Outside the console the narrow layout is kept.
 * - With no rows it renders nothing: the list shows its empty state. The page
 *   size is offered only when a choice would change something (more rows
 *   than the smallest size); the pages only when there are two or more.
 *
 * The caller reads its rows for min(params.page, pageCount(total, perPage)),
 * so a stale ?page= past the end shows the last page, as these numbers do.
 */
export function Pagination({ path, params, total, label = "Pages" }: PaginationProps) {
  if (!(total > 0)) return null;
  const pages = pageCount(total, params.perPage);
  const current = Math.min(params.page, pages);
  const first = (current - 1) * params.perPage + 1;
  const last = Math.min(current * params.perPage, total);
  const href = (page: number) => listHref(path, params, { page });

  return (
    <div className="pagination">
      <p className="pagination__summary">
        Showing {num(first)}–{num(last)} of {num(total)}
      </p>

      {pages > 1 ? (
        <nav className="pagination__nav" aria-label={label}>
          <ul className="pagination__pages">
            <li className="pagination__end">
              <Step label="Previous" href={current > 1 ? href(current - 1) : null} rel="prev" />
            </li>
            {pageItems(current, pages).map((p, i) =>
              p === null ? (
                // A gap stands for two or more pages; the numbers either
                // side already say which, so it is hidden from screen readers.
                <li key={`gap-${i}`} className="pagination__gap" aria-hidden="true">
                  …
                </li>
              ) : (
                <li key={p} className="pagination__num">
                  {p === current ? (
                    <span className="pagination__link" aria-current="page">
                      <PageWord />
                      {num(p)}
                    </span>
                  ) : (
                    <Link className="pagination__link" href={href(p)}>
                      <PageWord />
                      {num(p)}
                    </Link>
                  )}
                </li>
              )
            )}
            <li className="pagination__status">
              Page {num(current)} of {num(pages)}
            </li>
            <li className="pagination__end">
              <Step label="Next" href={current < pages ? href(current + 1) : null} rel="next" />
            </li>
          </ul>
        </nav>
      ) : null}

      {total > PER_PAGE[0] ? (
        <p className="pagination__per">
          <span>Show</span>
          <span className="pagination__choices">
            {PER_PAGE.map((n, i) => (
              <Fragment key={n}>
                {i > 0 ? (
                  <span className="pagination__dot" aria-hidden="true">
                    ·
                  </span>
                ) : null}
                {n === params.perPage ? (
                  <span className="pagination__link" aria-current="true">
                    {n}
                    <PerPageWords />
                  </span>
                ) : (
                  <Link className="pagination__link" href={listHref(path, params, { perPage: n })}>
                    {n}
                    <PerPageWords />
                  </Link>
                )}
              </Fragment>
            ))}
          </span>
          {/* Each choice already says "per page" to a screen reader. */}
          <span aria-hidden="true">per page</span>
        </p>
      ) : null}
    </div>
  );
}

/** Previous or Next: a link, or at the end of the list a link with no href (not focusable) marked unavailable. */
function Step({ label, href, rel }: { label: string; href: string | null; rel: "prev" | "next" }) {
  // A no-break space: .sr-only is absolutely positioned, so a plain leading
  // space collapses and the name would read "Previouspage".
  const words = <span className="sr-only">{" page"}</span>;
  return href ? (
    <Link className="pagination__link pagination__step" href={href} rel={rel}>
      {label}
      {words}
    </Link>
  ) : (
    <a className="pagination__link pagination__step" role="link" aria-disabled="true">
      {label}
      {words}
    </a>
  );
}

/** "Page " before a number, for screen readers only: the link reads "Page 4". A no-break space, as in Step. */
function PageWord() {
  return <span className="sr-only">{"Page "}</span>;
}

/** " per page" after a page size, for screen readers only: the link reads "50 per page". */
function PerPageWords() {
  return <span className="sr-only">{" per page"}</span>;
}

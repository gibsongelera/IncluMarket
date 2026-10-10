import Link from "next/link";

/**
 * "Load more" as a real link to the next page of results: with JavaScript the
 * page updates in place and keeps its scroll position; without it, it is an
 * ordinary link. The count is a live region, so a screen reader hears how
 * many products are now listed.
 */
export function LoadMore({ shown, total, href }: { shown: number; total: number; href: string | null }) {
  return (
    <div className="load-more">
      <p className="load-more__count" role="status" aria-live="polite" aria-atomic="true">
        Showing {shown} of {total} product{total === 1 ? "" : "s"}
      </p>
      {href ? (
        <Link className="btn btn--outline" href={href} scroll={false}>
          Load more
        </Link>
      ) : null}
    </div>
  );
}

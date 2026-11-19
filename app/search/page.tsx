import Link from "next/link";
import type { Metadata } from "next";
import { getRenderSession } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SearchLayout } from "@/components/SearchLayout";
import { SearchFilters } from "@/components/SearchFilters";
import { SortTabs } from "@/components/SortTabs";
import { StorefrontGrid } from "@/components/StorefrontGrid";
import { LoadMore } from "@/components/LoadMore";
import { getCategories, getWishlistProductIds } from "@/lib/data";
import { searchStorefront } from "@/lib/storefront";
import { parseStorefrontParams, storefrontParams } from "@/lib/storefront-core";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const q = parseStorefrontParams(await searchParams).q;
  return { title: q ? `Results for “${q}”` : "Search", robots: { index: false } };
}

/**
 * /search (C-17): text search plus filters — category, the price the buyer
 * pays, rating, PWD-friendly features, verified sellers — with the sort in
 * the URL. Typo-tolerant: "bayng" still finds "Bayong bag".
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getRenderSession();
  const query = parseStorefrontParams(await searchParams);
  const [categories, results, wishlistIds] = await Promise.all([
    getCategories(),
    searchStorefront(query),
    session?.role === "buyer" ? getWishlistProductIds(session.user_id) : Promise.resolve([] as number[]),
  ]);

  const activeCount =
    (query.category ? 1 : 0) +
    (query.min !== undefined ? 1 : 0) +
    (query.max !== undefined ? 1 : 0) +
    (query.rating ? 1 : 0) +
    (query.tags?.length ?? 0) +
    (query.verified ? 1 : 0);
  const params = Object.fromEntries(storefrontParams(query, { page: 1 }));
  const nextHref = results.hasMore && (query.page ?? 1) < 10
    ? `/search?${storefrontParams(query, { page: (query.page ?? 1) + 1 }).toString()}`
    : null;

  return (
    <>
      <SiteHeader variant={session?.role ?? "buyer"} session={session} />
      <main id="main" tabIndex={-1} className="container main--search">
        <div className="search-head">
          <h1>{query.q ? <>Results for &ldquo;{query.q}&rdquo;</> : "Search the shop"}</h1>
          <p className="muted" role="status" aria-live="polite" aria-atomic="true">
            {results.total} product{results.total === 1 ? "" : "s"}
            {activeCount ? ` · ${activeCount} filter${activeCount === 1 ? "" : "s"} on` : ""}
          </p>
        </div>

        <SearchLayout activeCount={activeCount} filters={<SearchFilters query={query} categories={categories} />}>
          <div className="feed-head">
            <h2 id="results-title" className="sr-only">
              Results
            </h2>
            <SortTabs action="/search" current={query.sort ?? (query.q ? "relevance" : "latest")} params={params} withRelevance={Boolean(query.q)} />
          </div>

          {results.items.length ? (
            <>
              <StorefrontGrid
                items={results.items}
                wishlistIds={wishlistIds}
                showWishlist={session?.role === "buyer"}
              />
              <LoadMore shown={results.shown} total={results.total} href={nextHref} />
            </>
          ) : (
            <div className="empty empty--search">
              <h2>No products match{query.q ? <> &ldquo;{query.q}&rdquo;</> : null}</h2>
              <ul>
                {query.q ? <li>Check the spelling, or try a shorter word such as &ldquo;bag&rdquo;.</li> : null}
                {activeCount ? <li>Turn off some filters — {activeCount} {activeCount === 1 ? "is" : "are"} on.</li> : null}
                <li>
                  <Link href="/home">Browse every category</Link>
                </li>
              </ul>
            </div>
          )}
        </SearchLayout>
      </main>
      <SiteFooter />
    </>
  );
}

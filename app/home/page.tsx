import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, homeForRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BannerStrip } from "@/components/BannerStrip";
import { CategoryChips } from "@/components/CategoryChips";
import { FlashSaleStrip } from "@/components/FlashSaleStrip";
import { LoadMore } from "@/components/LoadMore";
import { RecommendationRail } from "@/components/RecommendationRail";
import { getHomeRecommendations } from "@/lib/recommend";
import { SortTabs } from "@/components/SortTabs";
import { StorefrontGrid } from "@/components/StorefrontGrid";
import { getCategories, getFeaturedSellers, getWishlistProductIds } from "@/lib/data";
import {
  getActiveBanners,
  getCategoryCounts,
  getFeaturedStorefront,
  getOnSaleStorefront,
  searchStorefront,
} from "@/lib/storefront";
import { parseStorefrontParams, storefrontParams } from "@/lib/storefront-core";

export const dynamic = "force-dynamic";

/**
 * The storefront (/home), open to guests and buyers. Everything is decided
 * on the server from the URL — category, sort, how many pages are shown —
 * and only 24 cards are read per page (B-16, C-27). Search with filters
 * lives on /search; this page browses.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (session && session.role !== "buyer") redirect(homeForRole(session.role));

  const raw = await searchParams;
  // Home browses: category, seller and sort only. A text search goes to /search.
  const parsed = parseStorefrontParams(raw);
  if (parsed.q) redirect(`/search?${storefrontParams(parsed).toString()}`);
  const query = { category: parsed.category, seller: parsed.seller, sort: parsed.sort, page: parsed.page };
  const browsing = !query.category && !query.seller;

  const [categories, counts, results, onSale, featured, sellers, wishlistIds, banners, rec] = await Promise.all([
    getCategories(),
    getCategoryCounts(),
    searchStorefront(query),
    browsing ? getOnSaleStorefront(10) : Promise.resolve([]),
    browsing ? getFeaturedStorefront(10) : Promise.resolve([]),
    browsing || query.seller ? getFeaturedSellers() : Promise.resolve([]),
    session ? getWishlistProductIds(session.user_id) : Promise.resolve([] as number[]),
    browsing ? getActiveBanners() : Promise.resolve([]),
    browsing ? getHomeRecommendations(session?.role === "buyer" ? session.user_id : null) : Promise.resolve(null),
  ]);

  const showWishlist = Boolean(session);
  const params = Object.fromEntries(storefrontParams(query, { page: 1 }));
  const href = (overrides: Parameters<typeof storefrontParams>[1]) => {
    const qs = storefrontParams(query, overrides).toString();
    return qs ? `/home?${qs}` : "/home";
  };
  const sellerName = query.seller ? sellers.find((s) => s.id === query.seller)?.name ?? "this seller" : null;
  const cat = query.category ? categories.find((c) => c.id === query.category) : null;
  const catName = cat ? cat.folder || cat.label : null;

  return (
    <>
      <SiteHeader variant="buyer" active="home" session={session} />
      <main id="main" tabIndex={-1} className="container main--home">
        <h1 className="sr-only">Shop InclusiveMarket</h1>
        <BannerStrip banners={banners} />

        <CategoryChips
          categories={categories}
          counts={counts.byCategory}
          total={counts.total}
          current={query.category}
          hrefFor={(id) => href({ category: id ?? undefined, page: 1, seller: undefined })}
        />

        {browsing ? <FlashSaleStrip items={onSale} wishlistIds={wishlistIds} showWishlist={showWishlist} /> : null}

        {browsing && sellers.length ? (
          <section className="rail" aria-labelledby="sellers-title">
            <h2 id="sellers-title">Featured PWD sellers</h2>
            <ul className="seller-rail" role="list">
              {sellers.map((s) => (
                <li key={s.id}>
                  <Link className="seller-card" href={`/home?seller=${s.id}`}>
                    <span className="seller-card__avatar" aria-hidden="true">
                      {s.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="seller-card__name">{s.name}</span>
                    {s.seller_story ? <span className="seller-card__story">{s.seller_story}</span> : null}
                    <span className="badge badge--featured">Shop this seller</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {browsing && featured.length ? (
          <section className="rail" aria-labelledby="featured-title">
            <h2 id="featured-title">Featured products</h2>
            <StorefrontGrid items={featured} wishlistIds={wishlistIds} showWishlist={showWishlist} labelledBy="featured-title" />
          </section>
        ) : null}

        {rec ? <RecommendationRail rec={rec} wishlistIds={wishlistIds} showWishlist={showWishlist} /> : null}

        <section className="feed" aria-labelledby="feed-title">
          <div className="feed-head">
            <h2 id="feed-title">{sellerName ? `Products from ${sellerName}` : catName ?? "Discover"}</h2>
            <SortTabs action="/home" current={query.sort ?? "latest"} params={params} withRelevance={false} />
          </div>
          {sellerName ? (
            <p className="filter-bar__count">
              <Link className="btn btn--ghost btn--sm" href={href({ seller: undefined, page: 1 })} scroll={false}>
                Show all sellers
              </Link>
            </p>
          ) : null}

          {results.items.length ? (
            <>
              <StorefrontGrid items={results.items} wishlistIds={wishlistIds} showWishlist={showWishlist} labelledBy="feed-title" />
              <LoadMore
                shown={results.shown}
                total={results.total}
                href={results.hasMore && (query.page ?? 1) < 10 ? href({ page: (query.page ?? 1) + 1 }) : null}
              />
            </>
          ) : (
            <div className="empty">
              <p>Nothing here yet{catName ? ` in ${catName}` : ""}.</p>
              <p>
                <Link href="/home">See all products</Link> or <Link href="/search">search the shop</Link>.
              </p>
            </div>
          )}
          <p className="feed__more">
            Looking for something specific? <Link href="/search">Search with filters</Link> — price, rating,
            PWD-friendly features and verified sellers.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

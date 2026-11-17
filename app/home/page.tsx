import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, homeForRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BannerStrip } from "@/components/BannerStrip";
import { CategoryChips } from "@/components/CategoryChips";
import { FlashSaleStrip } from "@/components/FlashSaleStrip";
import { LoadMore } from "@/components/LoadMore";
import { ProductRail } from "@/components/ProductRail";
import { RecommendationRail } from "@/components/RecommendationRail";
import { getHomeRecommendations } from "@/lib/recommend";
import { SortTabs } from "@/components/SortTabs";
import { StoreCards } from "@/components/StoreCards";
import { StorefrontGrid } from "@/components/StorefrontGrid";
import { getCategories, getWishlistProductIds } from "@/lib/data";
import { getFeaturedShops } from "@/lib/shops";
import {
  getActiveBanners,
  getCategoryBestSellers,
  getCategoryCounts,
  getFeaturedStorefront,
  getOnSaleStorefront,
  searchStorefront,
  type CategoryBestSellers,
} from "@/lib/storefront";
import { heroPromo, parseStorefrontParams, storefrontParams } from "@/lib/storefront-core";

export const dynamic = "force-dynamic";

/**
 * The storefront (/home), open to guests and buyers. Everything is decided
 * on the server from the URL — category, sort, how many pages are shown —
 * and only 24 cards are read per page (B-16, C-27). Search with filters
 * lives on /search; this page browses.
 *
 * Browsing (no category), top to bottom as 05 §2: the hero, Explore
 * categories, Today's deals, Featured products, Shops by PWD sellers, the
 * two "Best sellers in …" rails, Picked for you, Discover. A section with
 * nothing to show is not rendered. With a category selected only the tiles
 * and that category's feed show, and the other reads are not made.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (session && session.role !== "buyer") redirect(homeForRole(session.role));

  const raw = await searchParams;
  // Home browses: category and sort. A text search goes to /search.
  const parsed = parseStorefrontParams(raw);
  if (parsed.q) redirect(`/search?${storefrontParams(parsed).toString()}`);
  // Seller pages moved to /shop/[id] (C-23); old links still land there.
  if (parsed.seller) redirect(`/shop/${parsed.seller}`);
  const query = { category: parsed.category, sort: parsed.sort, page: parsed.page };
  const browsing = !query.category;

  // One Promise.all. The best sellers need the counts and the categories,
  // so they start as soon as those two arrive, while the rest still run
  // (no second count read: getCategoryBestSellers takes these).
  const categoriesP = getCategories();
  const countsP = getCategoryCounts();
  const bestP: Promise<CategoryBestSellers[]> = browsing
    ? Promise.all([countsP, categoriesP]).then(([c, cats]) => getCategoryBestSellers(c, cats))
    : Promise.resolve([]);

  const [categories, counts, results, onSale, featured, sellers, wishlistIds, banners, rec, bestSellers] = await Promise.all([
    categoriesP,
    countsP,
    searchStorefront(query),
    browsing ? getOnSaleStorefront(10) : Promise.resolve([]),
    browsing ? getFeaturedStorefront(10) : Promise.resolve([]),
    browsing ? getFeaturedShops() : Promise.resolve([]),
    session ? getWishlistProductIds(session.user_id) : Promise.resolve([] as number[]),
    browsing ? getActiveBanners() : Promise.resolve([]),
    browsing ? getHomeRecommendations(session?.role === "buyer" ? session.user_id : null) : Promise.resolve(null),
    bestP,
  ]);

  const showWishlist = Boolean(session);
  const params = Object.fromEntries(storefrontParams(query, { page: 1 }));
  const href = (overrides: Parameters<typeof storefrontParams>[1]) => {
    const qs = storefrontParams(query, overrides).toString();
    return qs ? `/home?${qs}` : "/home";
  };
  const cat = query.category ? categories.find((c) => c.id === query.category) : null;
  const catName = cat ? cat.folder || cat.label : null;

  return (
    <>
      <SiteHeader variant="buyer" active="home" session={session} />
      <main id="main" tabIndex={-1} className="container main--home">
        <h1 className="sr-only">Shop InclusiveMarket</h1>
        <BannerStrip banners={banners} promo={heroPromo(onSale, sellers)} />

        <CategoryChips
          categories={categories}
          counts={counts.byCategory}
          total={counts.total}
          current={query.category}
          hrefFor={(id) => href({ category: id ?? undefined, page: 1 })}
        />

        {browsing ? (
          <>
            <FlashSaleStrip items={onSale} wishlistIds={wishlistIds} showWishlist={showWishlist} />

            {/* No "View all": /search has no featured filter, so no page lists them all. */}
            <ProductRail
              id="featured-title"
              title="Featured products"
              label="featured products"
              items={featured}
              wishlistIds={wishlistIds}
              showWishlist={showWishlist}
            />

            <StoreCards shops={sellers} />

            {bestSellers.map((b, n) => (
              <ProductRail
                key={b.category.id}
                id={`best-${n + 1}-title`}
                title={`Best sellers in ${b.category.label}`}
                label={`best sellers in ${b.category.label}`}
                items={b.items}
                wishlistIds={wishlistIds}
                showWishlist={showWishlist}
                viewAll={{
                  href: href({ category: b.category.id, sort: "top_sales", page: 1 }),
                  name: `best sellers in ${b.category.label}`,
                }}
              />
            ))}

            {rec ? <RecommendationRail rec={rec} wishlistIds={wishlistIds} showWishlist={showWishlist} /> : null}
          </>
        ) : null}

        <section className="feed" aria-labelledby="feed-title">
          <div className="section-head">
            <h2 id="feed-title">{catName ?? "Discover"}</h2>
            <SortTabs action="/home" current={query.sort ?? "latest"} params={params} withRelevance={false} />
          </div>

          {results.items.length ? (
            <>
              <StorefrontGrid items={results.items} wishlistIds={wishlistIds} showWishlist={showWishlist} />
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

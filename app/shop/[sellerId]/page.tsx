import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SortTabs } from "@/components/SortTabs";
import { StorefrontGrid } from "@/components/StorefrontGrid";
import { LoadMore } from "@/components/LoadMore";
import { StarRating } from "@/components/StarRating";
import { Icon } from "@/components/Icon";
import { getWishlistProductIds } from "@/lib/data";
import { getPublicShop } from "@/lib/shops";
import { searchStorefront } from "@/lib/storefront";
import { parseStorefrontParams, storefrontParams } from "@/lib/storefront-core";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ sellerId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const shop = await getPublicShop(Number((await params).sellerId));
  return shop
    ? { title: shop.name, description: shop.story?.slice(0, 160) ?? `Products made by ${shop.name}.` }
    : { title: "Shop not found" };
}

/**
 * A seller's public shop (C-23): banner, story, verified badge, rating, and
 * their listings with the same server-side sort and "Load more" as the shop.
 * No loading boundary on purpose: an unknown shop answers a real 404.
 */
export default async function ShopPage({ params, searchParams }: Params) {
  const session = await getSession();
  const shop = await getPublicShop(Number((await params).sellerId));
  if (!shop) notFound();

  const parsed = parseStorefrontParams(await searchParams);
  const query = { seller: shop.id, sort: parsed.sort, page: parsed.page };
  const [results, wishlistIds] = await Promise.all([
    searchStorefront(query),
    session?.role === "buyer" ? getWishlistProductIds(session.user_id) : Promise.resolve([] as number[]),
  ]);
  const base = `/shop/${shop.id}`;
  const params2 = Object.fromEntries(storefrontParams({ sort: query.sort }));
  const next =
    results.hasMore && (query.page ?? 1) < 10
      ? `${base}?${storefrontParams({ sort: query.sort, page: (query.page ?? 1) + 1 }).toString()}`
      : null;

  return (
    <>
      <SiteHeader variant={session?.role ?? "buyer"} session={session} />
      <main id="main" tabIndex={-1} className="container main--shop">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/home">Shop</Link> <span aria-hidden="true">/</span> {shop.name}
        </nav>

        <header className="shop-head">
          {shop.banner ? (
            // eslint-disable-next-line @next/next/no-img-element -- seller-managed banner
            <img className="shop-head__banner" src={shop.banner} alt="" />
          ) : null}
          <div className="shop-head__body">
            <span className="shop-head__logo" aria-hidden="true">
              {shop.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- seller-managed logo
                <img src={shop.logo} alt="" />
              ) : (
                shop.name.charAt(0).toUpperCase()
              )}
            </span>
            <div>
              <h1 className="shop-head__name">{shop.name}</h1>
              <p className="shop-head__meta">
                {shop.verified ? (
                  <span className="badge badge--verified">
                    <Icon name="check" size={12} /> Verified PWD seller
                  </span>
                ) : null}
                {shop.rating.count ? (
                  <span>
                    <StarRating score={shop.rating.average} /> {shop.rating.average.toFixed(1)}
                    <span className="sr-only"> out of 5</span> ({shop.rating.count} review{shop.rating.count === 1 ? "" : "s"})
                  </span>
                ) : (
                  <span className="muted">No reviews yet</span>
                )}
                <span>
                  {shop.productCount} product{shop.productCount === 1 ? "" : "s"}
                </span>
                {shop.city ? <span>{shop.city}</span> : null}
                <span className="muted">Selling since {formatDate(shop.since)}</span>
              </p>
            </div>
          </div>
          {shop.story ? (
            <section className="shop-head__story" aria-label={`About ${shop.name}`}>
              <p>{shop.story}</p>
            </section>
          ) : null}
        </header>

        <section className="feed" aria-labelledby="shop-products">
          <div className="feed-head">
            <h2 id="shop-products">Products</h2>
            <SortTabs action={base} current={query.sort ?? "latest"} params={params2} withRelevance={false} />
          </div>
          {results.items.length ? (
            <>
              <StorefrontGrid
                items={results.items}
                wishlistIds={wishlistIds}
                showWishlist={session?.role === "buyer"}
              />
              <LoadMore shown={results.shown} total={results.total} href={next} />
            </>
          ) : (
            <p className="empty">This seller has nothing for sale right now.</p>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

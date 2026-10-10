import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ProductDetailClient } from "@/components/ProductDetailClient";
import {
  getActiveSaleForProduct,
  getCategories,
  getDisplayNames,
  getProductById,
  getPublicProductById,
  getVariantsByProduct,
  getWishlistProductIds,
} from "@/lib/data";
import type { Product } from "@/lib/types";
import type { SessionUser } from "@/lib/types";
import { isVerifiedPwd } from "@/lib/pwd/data";
import { getReviewsLite, summarize } from "@/lib/reviews";
import { ReviewsSection } from "@/components/ReviewsSection";
import { StorefrontGrid } from "@/components/StorefrontGrid";
import { getAlsoBought, recordProductView } from "@/lib/recommend";
import { getStorefrontItems, searchStorefront } from "@/lib/storefront";
import { getPublicShop } from "@/lib/shops";
import { Icon } from "@/components/Icon";
import { StarRating } from "@/components/StarRating";
import { after } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Resolve what this visitor may see.
 *
 * The public sees only approved listings from active sellers. The listing's
 * own seller and admins may additionally open it in any status, as a clearly
 * labelled preview — that is how a seller checks a pending listing and how an
 * admin moderates one. Everyone else gets a real 404, not a 200 page that says
 * "not found".
 */
async function resolveProduct(
  id: number,
  session: SessionUser | null
): Promise<{ product: Product; preview: boolean } | null> {
  const product = await getPublicProductById(id);
  if (product) return { product, preview: false };
  if (!session || (session.role !== "admin" && session.role !== "seller")) return null;
  const any = await getProductById(id);
  if (!any) return null;
  if (session.role === "admin" || any.seller_id === session.user_id) return { product: any, preview: true };
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getPublicProductById(Number(id));
  return { title: product ? product.title : "Product" };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  const { id } = await params;
  const resolved = await resolveProduct(Number(id), session);
  if (!resolved) notFound();
  const { product, preview } = resolved;

  const [variants, reviews, categories, sale] = await Promise.all([
    getVariantsByProduct(product.id),
    getReviewsLite([product.id]),
    getCategories(),
    getActiveSaleForProduct(product.id),
  ]);
  const [names, sellerVerified, wishlistIds] = await Promise.all([
    getDisplayNames([product.seller_id]),
    isVerifiedPwd(product.seller_id),
    session?.role === "buyer" ? getWishlistProductIds(session.user_id) : Promise.resolve([] as number[]),
  ]);
  const cat = categories.find((c) => c.id === product.category);
  const catFolder = cat ? cat.folder || cat.label : product.category || "Uncategorized";
  const summary = summarize(reviews);
  const [live, shop] = preview
    ? [null, null]
    : await Promise.all([getStorefrontItems([product.id]).then((r) => r[0] ?? null), getPublicShop(product.seller_id)]);

  // "Customers also bought" from shared orders; the same category otherwise.
  let alsoBought = preview ? [] : await getAlsoBought(product.id);
  let alsoTitle = "Customers also bought";
  if (!preview && alsoBought.length < 3 && product.category) {
    alsoBought = (await searchStorefront({ category: product.category, sort: "top_sales", pageSize: 7 })).items
      .filter((i) => i.id !== product.id)
      .slice(0, 6);
    alsoTitle = `More in ${catFolder}`;
  }
  // Recommendations signal (signed-in buyers, unless they opted out), after
  // the response so it never slows the page.
  if (session?.role === "buyer" && !preview) {
    const buyerId = session.user_id;
    after(() => recordProductView(buyerId, product.id));
  }

  return (
    <>
      <SiteHeader variant="buyer" active="home" session={session} />
      <main id="main" tabIndex={-1} className="container main--product">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/home">Shop</Link> <span aria-hidden="true">/</span>{" "}
          <span id="crumb-title">{product.title}</span>
        </nav>

        {preview ? (
          <p className="notice notice--warning" role="status">
            Preview — this listing is <strong>{product.status}</strong> and is not visible to buyers.
          </p>
        ) : null}

        <ProductDetailClient
          product={product}
          variants={variants}
          sellerName={names[product.seller_id] || "PWD Seller"}
          sellerVerified={sellerVerified}
          wishlisted={wishlistIds.includes(product.id)}
          soldCount={live?.soldCount ?? 0}
          categoryFolder={catFolder}
          userId={session?.role === "buyer" ? session.user_id : undefined}
          rating={summary.average}
          ratingCount={summary.count}
          salePercent={sale ? Number(sale.discount_percent) : null}
        />

        {shop ? (
          <section className="card shop-card" aria-labelledby="shop-card-title">
            <span className="shop-head__logo" aria-hidden="true">
              {shop.name.charAt(0).toUpperCase()}
            </span>
            <div className="shop-card__body">
              <h2 id="shop-card-title" className="shop-card__name">
                {shop.name}
              </h2>
              <p className="shop-head__meta">
                {shop.verified ? (
                  <span className="badge badge--verified">
                    <Icon name="check" size={12} /> Verified PWD seller
                  </span>
                ) : null}
                {shop.rating.count ? (
                  <span>
                    <StarRating score={shop.rating.average} /> {shop.rating.average.toFixed(1)}
                    <span className="sr-only"> out of 5</span>
                  </span>
                ) : null}
                <span>
                  {shop.productCount} product{shop.productCount === 1 ? "" : "s"}
                </span>
              </p>
              {shop.story ? <p className="shop-card__story">{shop.story}</p> : null}
            </div>
            <Link className="btn btn--outline btn--sm" href={`/shop/${shop.id}`}>
              Visit shop<span className="sr-only">: {shop.name}</span>
            </Link>
          </section>
        ) : null}

        <ReviewsSection reviews={reviews} summary={summary} />

        {alsoBought.length ? (
          <section className="rail" aria-labelledby="also-title">
            <h2 id="also-title">{alsoTitle}</h2>
            <StorefrontGrid
              items={alsoBought}
              wishlistIds={wishlistIds}
              showWishlist={session?.role === "buyer"}
              labelledBy="also-title"
            />
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}

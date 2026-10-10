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
          categoryFolder={catFolder}
          userId={session?.role === "buyer" ? session.user_id : undefined}
          rating={summary.average}
          ratingCount={summary.count}
          salePercent={sale ? Number(sale.discount_percent) : null}
        />

        <ReviewsSection reviews={reviews} summary={summary} />
      </main>
      <SiteFooter />
    </>
  );
}

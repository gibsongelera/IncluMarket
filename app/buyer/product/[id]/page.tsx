import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ProductDetailClient } from "@/components/ProductDetailClient";
import { StarRating } from "@/components/StarRating";
import { formatDate } from "@/lib/format";
import {
  getActiveSaleForProduct,
  getCategories,
  getDisplayNames,
  getProductById,
  getPublicProductById,
  getReviewsByProduct,
  getVariantsByProduct,
  ratingByProduct,
} from "@/lib/data";
import type { Product } from "@/lib/types";
import type { SessionUser } from "@/lib/types";
import { isVerifiedPwd } from "@/lib/pwd/data";

export const dynamic = "force-dynamic";

function reviewerName(name: string | undefined): string {
  if (!name) return "Buyer";
  const parts = name.split(" ");
  return parts[0] + " " + (parts[1] || "").charAt(0) + ".";
}

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
    getReviewsByProduct(product.id),
    getCategories(),
    getActiveSaleForProduct(product.id),
  ]);
  const [names, sellerVerified] = await Promise.all([
    getDisplayNames([product.seller_id, ...reviews.map((r) => r.buyer_id)]),
    isVerifiedPwd(product.seller_id),
  ]);
  const cat = categories.find((c) => c.id === product.category);
  const catFolder = cat ? cat.folder || cat.label : product.category || "Uncategorized";
  const { avg, count } = ratingByProduct(reviews);

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
          categoryFolder={catFolder}
          userId={session?.role === "buyer" ? session.user_id : undefined}
          rating={avg[product.id] || 0}
          ratingCount={count[product.id] || 0}
          salePercent={sale ? Number(sale.discount_percent) : null}
        />

        <section className="reviews" aria-labelledby="reviews-title">
          <h2 id="reviews-title">Customer reviews</h2>
          <div className="reviews-list">
            {reviews.length === 0 ? (
              <p className="empty">No reviews yet.</p>
            ) : (
              reviews.map((r) => (
                <article className="review" key={r.id}>
                  <header>
                    <strong>{reviewerName(names[r.buyer_id])}</strong>
                    <span className="muted small">{formatDate(r.created_at)}</span>
                  </header>
                  <StarRating score={r.rating_score} />
                  <p>{r.comment_text}</p>
                </article>
              ))
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

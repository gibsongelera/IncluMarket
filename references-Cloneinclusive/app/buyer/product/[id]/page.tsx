import Link from "next/link";
import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ProductDetailClient } from "@/components/ProductDetailClient";
import { StarRating } from "@/components/StarRating";
import { formatDate } from "@/lib/format";
import {
  getCategories,
  getProductById,
  getProfileById,
  getProfiles,
  getReviewsByProduct,
  getVariantsByProduct,
} from "@/lib/data";

export const dynamic = "force-dynamic";

function reviewerName(name: string | undefined): string {
  if (!name) return "Buyer";
  const parts = name.split(" ");
  return parts[0] + " " + (parts[1] || "").charAt(0) + ".";
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole(["buyer"]);
  const { id } = await params;
  const productId = Number(id);
  const product = await getProductById(productId);

  return (
    <>
      <SiteHeader variant="buyer" active="home" session={session} />
      <main id="main" className="container main--product">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/buyer/home">Shop</Link> <span aria-hidden="true">/</span>{" "}
          <span id="crumb-title">{product ? product.title : "Product"}</span>
        </nav>

        {!product ? (
          <p className="empty">
            Product not found. <Link href="/buyer/home">Back to shop.</Link>
          </p>
        ) : (
          <ProductDetail productId={productId} userId={session.user_id} />
        )}
      </main>
      <SiteFooter />
    </>
  );
}

async function ProductDetail({
  productId,
  userId,
}: {
  productId: number;
  userId: number;
}) {
  const product = (await getProductById(productId))!;
  const [variants, reviews, categories, seller, profiles] = await Promise.all([
    getVariantsByProduct(productId),
    getReviewsByProduct(productId),
    getCategories(),
    getProfileById(product.seller_id),
    getProfiles(),
  ]);
  const cat = categories.find((c) => c.id === product.category);
  const catFolder = cat ? cat.folder || cat.label : product.category || "Uncategorized";
  const nameById: Record<number, string> = {};
  profiles.forEach((p) => (nameById[p.id] = p.name));

  return (
    <>
      <ProductDetailClient
        product={product}
        variants={variants}
        sellerName={seller?.name || "PWD Seller"}
        categoryFolder={catFolder}
        userId={userId}
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
                  <strong>{reviewerName(nameById[r.buyer_id])}</strong>
                  <span className="muted small">{formatDate(r.created_at)}</span>
                </header>
                <StarRating score={r.rating_score} />
                <p>{r.comment_text}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </>
  );
}

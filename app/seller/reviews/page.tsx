import { requireRole } from "@/lib/session";
import { SellerReviewsClient } from "@/components/SellerReviewsClient";
import { getSellerProductIndex } from "@/lib/data";
import { getReviewsLite } from "@/lib/reviews";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer reviews" };

export default async function SellerReviewsPage() {
  const session = await requireRole(["seller"]);
  const products = await getSellerProductIndex(session.user_id);
  // Reviews on this seller's products only, with shortened reviewer names.
  // This page used to send every review and every user's name and raw email
  // (B-13); buyer ids no longer leave the server either.
  const reviews = await getReviewsLite(products.map((p) => p.id));

  return (
    <main id="main" tabIndex={-1} className="main--seller">
      <h1>Customer reviews</h1>
      <SellerReviewsClient reviews={reviews} products={products.map((p) => ({ id: p.id, title: p.title }))} />
    </main>
  );
}

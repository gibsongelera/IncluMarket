import { requireRole } from "@/lib/session";
import { SellerReviewsClient } from "@/components/SellerReviewsClient";
import { getDisplayNames, getReviewsForProducts, getSellerProductIndex } from "@/lib/data";
import { shortName } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SellerReviewsPage() {
  const session = await requireRole(["seller"]);
  const products = await getSellerProductIndex(session.user_id);
  // Reviews on this seller's products only, with reviewer display names. This
  // page used to send every review and every user's name and raw email (B-13).
  const reviews = await getReviewsForProducts(products.map((p) => p.id));
  const names = await getDisplayNames(reviews.map((r) => r.buyer_id));

  return (
    <main id="main" tabIndex={-1} className="main--seller">
      <h1>Customer reviews</h1>
      <SellerReviewsClient
        reviews={reviews}
        products={products.map((p) => ({ id: p.id, title: p.title }))}
        buyers={Object.entries(names).map(([id, name]) => ({ id: Number(id), name: shortName(name) }))}
      />
    </main>
  );
}

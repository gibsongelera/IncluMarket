import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WishlistClient } from "@/components/WishlistClient";
import {
  getWishlistProducts,
  getCategories,
  getReviewsForProducts,
  getVariantsForProducts,
  ratingByProduct,
  stockByProduct,
} from "@/lib/data";
import { verifiedAmong } from "@/lib/pwd/data";

export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const session = await requireRole(["buyer"]);
  const [products, categories] = await Promise.all([
    getWishlistProducts(session.user_id),
    getCategories(),
  ]);
  const ids = products.map((p) => p.id);
  const [variants, reviews] = await Promise.all([getVariantsForProducts(ids), getReviewsForProducts(ids)]);
  const stock = stockByProduct(variants);
  const { avg, count } = ratingByProduct(reviews);
  const verifiedSellerIds = [...(await verifiedAmong(products.map((p) => p.seller_id)))];

  return (
    <>
      <SiteHeader variant="buyer" active="wishlist" session={session} />
      <main id="main" tabIndex={-1} className="container main--wishlist">
        <h1>Your wishlist</h1>
        <WishlistClient
          products={products}
          categories={categories}
          stock={stock}
          ratingAvg={avg}
          ratingCount={count}
          verifiedSellerIds={verifiedSellerIds}
        />
      </main>
      <SiteFooter />
    </>
  );
}

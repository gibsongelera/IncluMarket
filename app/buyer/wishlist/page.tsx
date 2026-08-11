import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WishlistClient } from "@/components/WishlistClient";
import {
  getWishlistProducts,
  getCategories,
  getReviews,
  getVariants,
  ratingByProduct,
  stockByProduct,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const session = await requireRole(["buyer"]);
  const [products, variants, reviews, categories] = await Promise.all([
    getWishlistProducts(session.user_id),
    getVariants(),
    getReviews(),
    getCategories(),
  ]);
  const stock = stockByProduct(variants);
  const { avg, count } = ratingByProduct(reviews);

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
        />
      </main>
      <SiteFooter />
    </>
  );
}

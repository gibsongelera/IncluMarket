import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SellerReviewsClient } from "@/components/SellerReviewsClient";
import { getProductsBySeller, getProfiles, getReviews } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SellerReviewsPage() {
  const session = await requireRole(["seller"]);
  const [products, reviews, profiles] = await Promise.all([
    getProductsBySeller(session.user_id),
    getReviews(),
    getProfiles(),
  ]);
  const myProdIds = new Set(products.map((p) => p.id));
  const myReviews = reviews.filter((r) => myProdIds.has(r.product_id));

  return (
    <>
      <SiteHeader variant="seller" active="reviews" session={session} />
      <main id="main" tabIndex={-1} className="container main--seller">
        <h1>Customer reviews</h1>
        <SellerReviewsClient
          reviews={myReviews}
          products={products.map((p) => ({ id: p.id, title: p.title }))}
          buyers={profiles.map((p) => ({ id: p.id, name: p.name, email: p.email }))}
        />
      </main>
      <SiteFooter />
    </>
  );
}

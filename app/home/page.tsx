import { redirect } from "next/navigation";
import { getSession, homeForRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BuyerHomeClient } from "@/components/BuyerHomeClient";
import {
  getActiveFlashSales,
  getApprovedProducts,
  getCategories,
  getFeaturedProducts,
  getFeaturedSellers,
  getOrderItems,
  getReviews,
  getVariants,
  getWishlistProductIds,
  popularityByProduct,
  ratingByProduct,
  stockByProduct,
} from "@/lib/data";

export const dynamic = "force-dynamic";

// The public storefront (/home): browsing is open to everyone, signed in or
// not. Signed-in non-buyers (seller/admin) get sent to their own dashboard;
// guests and buyers both see the full catalog, with cart/wishlist actions
// gated at the point of use (see ProductDetailClient's requireLogin()).
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; seller?: string }>;
}) {
  const session = await getSession();
  if (session && session.role !== "buyer") redirect(homeForRole(session.role));

  const sp = await searchParams;
  const [products, variants, reviews, categories, wishlistIds, orderItems, featured, flashSales, featuredSellers] =
    await Promise.all([
      getApprovedProducts(),
      getVariants(),
      getReviews(),
      getCategories(),
      session ? getWishlistProductIds(session.user_id) : Promise.resolve([] as number[]),
      getOrderItems(),
      getFeaturedProducts(),
      getActiveFlashSales(),
      getFeaturedSellers(),
    ]);
  const stock = stockByProduct(variants);
  const { avg, count } = ratingByProduct(reviews);
  const popularity = popularityByProduct(orderItems);

  return (
    <>
      <SiteHeader variant="buyer" active="home" session={session} />
      <main id="main" tabIndex={-1} className="container main--buyer">
        <BuyerHomeClient
          products={products}
          categories={categories}
          stock={stock}
          ratingAvg={avg}
          ratingCount={count}
          popularity={popularity}
          initialQ={sp.q || ""}
          initialCat={sp.cat || ""}
          initialSeller={sp.seller ? Number(sp.seller) : 0}
          wishlistIds={wishlistIds}
          featured={featured}
          flashSales={flashSales}
          featuredSellers={featuredSellers.map((s) => ({
            id: s.id,
            name: s.name,
            seller_story: s.seller_story,
          }))}
          isGuest={!session}
        />
      </main>
      <SiteFooter />
    </>
  );
}

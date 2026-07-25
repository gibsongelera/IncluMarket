import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BuyerHomeClient } from "@/components/BuyerHomeClient";
import {
  getApprovedProducts,
  getCategories,
  getReviews,
  getVariants,
  ratingByProduct,
  stockByProduct,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function BuyerHomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string }>;
}) {
  const session = await requireRole(["buyer"]);
  const sp = await searchParams;
  const [products, variants, reviews, categories] = await Promise.all([
    getApprovedProducts(),
    getVariants(),
    getReviews(),
    getCategories(),
  ]);
  const stock = stockByProduct(variants);
  const { avg, count } = ratingByProduct(reviews);

  return (
    <>
      <SiteHeader variant="buyer" active="home" session={session} />
      <main id="main" className="container main--buyer">
        <BuyerHomeClient
          products={products}
          categories={categories}
          stock={stock}
          ratingAvg={avg}
          ratingCount={count}
          initialQ={sp.q || ""}
          initialCat={sp.cat || ""}
        />
      </main>
      <SiteFooter />
    </>
  );
}

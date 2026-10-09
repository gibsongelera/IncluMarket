import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SellerProductsClient } from "@/components/SellerProductsClient";
import { getCategories, getProductsBySeller, getVariantsForProducts } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SellerProductsPage() {
  const session = await requireRole(["seller"]);
  const [products, categories] = await Promise.all([
    getProductsBySeller(session.user_id),
    getCategories(),
  ]);
  const variants = await getVariantsForProducts(products.map((p) => p.id));

  return (
    <>
      <SiteHeader variant="seller" active="products" session={session} />
      <main id="main" tabIndex={-1} className="container main--seller">
        <SellerProductsClient
          products={products}
          variants={variants}
          categories={categories}
        />
      </main>
      <SiteFooter />
    </>
  );
}

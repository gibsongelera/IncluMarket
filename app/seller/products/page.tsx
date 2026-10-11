import { requireRole } from "@/lib/session";
import { SellerProductsClient } from "@/components/SellerProductsClient";
import { getAllCategories, getProductsBySeller, getVariantsForProducts } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SellerProductsPage() {
  const session = await requireRole(["seller"]);
  const [products, categories] = await Promise.all([
    getProductsBySeller(session.user_id),
    getAllCategories(),
  ]);
  const variants = await getVariantsForProducts(products.map((p) => p.id));

  return (
    <main id="main" tabIndex={-1} className="main--seller">
      <SellerProductsClient
        products={products}
        variants={variants}
        categories={categories}
      />
    </main>
  );
}

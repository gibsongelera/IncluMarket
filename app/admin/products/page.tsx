import { requireRole } from "@/lib/session";
import { AdminProductsClient } from "@/components/AdminProductsClient";
import { getAllProducts, getAllCategories, getProfiles } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const session = await requireRole(["admin"]);
  const [products, categories, profiles] = await Promise.all([
    getAllProducts(),
    getAllCategories(),
    getProfiles(),
  ]);

  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <h1>Product verification queue</h1>
      <AdminProductsClient
        products={products}
        categories={categories}
        sellers={profiles.map((p) => ({ id: p.id, name: p.name, email: p.email }))}
      />
    </main>
  );
}

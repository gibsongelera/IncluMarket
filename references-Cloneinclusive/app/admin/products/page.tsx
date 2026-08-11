import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AdminProductsClient } from "@/components/AdminProductsClient";
import { getAllProducts, getCategories, getProfiles } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const session = await requireRole(["admin"]);
  const [products, categories, profiles] = await Promise.all([
    getAllProducts(),
    getCategories(),
    getProfiles(),
  ]);

  return (
    <>
      <SiteHeader variant="admin" active="products" session={session} />
      <main id="main" className="container main--admin">
        <h1>Product verification queue</h1>
        <AdminProductsClient
          products={products}
          categories={categories}
          sellers={profiles.map((p) => ({ id: p.id, name: p.name, email: p.email }))}
        />
      </main>
      <SiteFooter />
    </>
  );
}

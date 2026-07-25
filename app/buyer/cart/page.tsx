import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CartClient } from "@/components/CartClient";
import { getAllProducts, getProfiles, getVariants } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const session = await requireRole(["buyer"]);
  const [products, variants, profiles] = await Promise.all([
    getAllProducts(),
    getVariants(),
    getProfiles(),
  ]);

  return (
    <>
      <SiteHeader variant="buyer" active="home" session={session} />
      <main id="main" className="container main--cart">
        <h1>Your cart</h1>
        <CartClient
          userId={session.user_id}
          products={products.map((p) => ({
            id: p.id,
            title: p.title,
            seller_id: p.seller_id,
            image: p.image,
            images: p.images ?? null,
          }))}
          variants={variants.map((v) => ({
            id: v.id,
            color_name: v.color_name,
            size: v.size,
            stock_qty: v.stock_qty,
            sku_code: v.sku_code,
          }))}
          sellers={profiles.map((p) => ({ id: p.id, name: p.name }))}
        />
      </main>
      <SiteFooter />
    </>
  );
}

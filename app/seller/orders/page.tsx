import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SellerOrdersClient } from "@/components/SellerOrdersClient";
import {
  getOrderItems,
  getOrders,
  getProductsBySeller,
  getProfiles,
  getVariants,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SellerOrdersPage() {
  const session = await requireRole(["seller"]);
  const [products, orderItems, orders, variants, profiles] = await Promise.all([
    getProductsBySeller(session.user_id),
    getOrderItems(),
    getOrders(),
    getVariants(),
    getProfiles(),
  ]);

  const myProdIds = new Set(products.map((p) => p.id));
  const myItems = orderItems.filter((it) => it.product_id != null && myProdIds.has(it.product_id));
  const orderIds = new Set(myItems.map((it) => it.order_id));
  const myOrders = orders
    .filter((o) => orderIds.has(o.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  // include all items belonging to those orders (for line display)
  const relatedItems = orderItems.filter((it) => orderIds.has(it.order_id));

  return (
    <>
      <SiteHeader variant="seller" active="orders" session={session} />
      <main id="main" className="container main--seller">
        <h1>Order fulfillment</h1>
        <SellerOrdersClient
          orders={myOrders}
          orderItems={relatedItems}
          products={products.map((p) => ({ id: p.id, title: p.title }))}
          variants={variants.map((v) => ({ id: v.id, color_name: v.color_name, size: v.size }))}
          buyers={profiles.map((p) => ({ id: p.id, name: p.name, email: p.email }))}
        />
      </main>
      <SiteFooter />
    </>
  );
}

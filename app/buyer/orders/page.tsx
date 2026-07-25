import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { OrdersClient } from "@/components/OrdersClient";
import {
  getAllProducts,
  getOrderItems,
  getOrdersByBuyer,
  getReviews,
  getVariants,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await requireRole(["buyer"]);
  const [orders, orderItems, products, variants, reviews] = await Promise.all([
    getOrdersByBuyer(session.user_id),
    getOrderItems(),
    getAllProducts(),
    getVariants(),
    getReviews(),
  ]);

  const reviewedProductIds = reviews
    .filter((r) => r.buyer_id === session.user_id)
    .map((r) => r.product_id);

  return (
    <>
      <SiteHeader variant="buyer" active="orders" session={session} />
      <main id="main" className="container main--orders">
        <h1>My orders</h1>
        <OrdersClient
          orders={orders}
          orderItems={orderItems.filter((it) => orders.some((o) => o.id === it.order_id))}
          products={products.map((p) => ({
            id: p.id,
            title: p.title,
            image: p.image,
            images: p.images ?? null,
          }))}
          variants={variants.map((v) => ({
            id: v.id,
            color_name: v.color_name,
            size: v.size,
          }))}
          reviewedProductIds={reviewedProductIds}
        />
      </main>
      <SiteFooter />
    </>
  );
}

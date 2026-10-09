import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { OrdersClient } from "@/components/OrdersClient";
import {
  getOrderItemsForOrders,
  getOrderStatusHistoryForOrders,
  getOrdersByBuyer,
  getProductThumbs,
  getReviewedProductIds,
  getVariantsByIds,
} from "@/lib/data";
import { expireStalePayments } from "@/lib/payments/stock";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await requireRole(["buyer"]);
  // Release stock held by online payments nobody finished (throttled; see
  // lib/payments/stock.ts). Runs before the read so this page shows the result.
  await expireStalePayments();

  const orders = await getOrdersByBuyer(session.user_id);
  const orderIds = orders.map((o) => o.id);
  const [orderItems, history, reviewedProductIds] = await Promise.all([
    getOrderItemsForOrders(orderIds),
    getOrderStatusHistoryForOrders(orderIds),
    getReviewedProductIds(session.user_id),
  ]);
  const [products, variants] = await Promise.all([
    getProductThumbs(orderItems.map((i) => i.product_id).filter((n): n is number => n != null)),
    getVariantsByIds(orderItems.map((i) => i.variant_id).filter((n): n is number => n != null)),
  ]);

  return (
    <>
      <SiteHeader variant="buyer" active="orders" session={session} />
      <main id="main" tabIndex={-1} className="container main--orders">
        <h1>My orders</h1>
        <OrdersClient
          orders={orders}
          orderItems={orderItems}
          products={products.map((p) => ({ id: p.id, title: p.title, image: p.image, images: p.images }))}
          variants={variants.map((v) => ({ id: v.id, color_name: v.color_name, size: v.size }))}
          reviewedProductIds={reviewedProductIds}
          history={history}
        />
      </main>
      <SiteFooter />
    </>
  );
}

import { requireRole } from "@/lib/session";
import { SellerOrdersClient, type SellerOrderLite } from "@/components/SellerOrdersClient";
import {
  getDisplayNames,
  getOrderItemsForProducts,
  getOrdersByIds,
  getOrderStatusHistoryForOrders,
  getSellerProductIndex,
  getVariantsByIds,
} from "@/lib/data";
import { shortName } from "@/lib/format";
import { roundMoney } from "@/lib/pricing/core";
import { verificationLast4 } from "@/lib/pwd/data";

export const dynamic = "force-dynamic";

export default async function SellerOrdersPage() {
  const session = await requireRole(["seller"]);
  const products = await getSellerProductIndex(session.user_id);

  // Only this seller's lines, and only the orders they appear in. This page
  // used to load every order, every line and every user's name and raw email,
  // and hand all of it to the browser (B-13); it also showed other sellers'
  // lines and the whole order total (B-09).
  const myItems = await getOrderItemsForProducts(products.map((p) => p.id));
  const orderIds = [...new Set(myItems.map((it) => it.order_id))];
  const [orders, history, variants] = await Promise.all([
    getOrdersByIds(orderIds),
    getOrderStatusHistoryForOrders(orderIds),
    getVariantsByIds(myItems.map((it) => it.variant_id).filter((n): n is number => n != null)),
  ]);
  const [names, last4] = await Promise.all([
    getDisplayNames(orders.map((o) => o.buyer_id)),
    verificationLast4(myItems.map((it) => it.verification_id ?? 0)),
  ]);
  const pwdCheck = (orderId: number) => {
    const lines = myItems.filter((it) => it.order_id === orderId && Number(it.pwd_discount_amount ?? 0) > 0);
    if (!lines.length) return null;
    const vid = lines.find((it) => it.verification_id)?.verification_id ?? null;
    return {
      amount: roundMoney(lines.reduce((n, it) => n + Number(it.pwd_discount_amount ?? 0), 0)),
      last4: vid ? last4.get(vid) ?? null : null,
    };
  };

  const lite: SellerOrderLite[] = orders.map((o) => ({
    id: o.id,
    created_at: o.created_at,
    order_status: o.order_status,
    payment_status: o.payment_status,
    payment_provider: o.payment_provider,
    buyer_id: o.buyer_id,
    // Shipping details are this seller's to see: they ship the parcel.
    shipping_name: o.shipping_name,
    shipping_address: o.shipping_address,
    shipping_city: o.shipping_city,
    shipping_phone: o.shipping_phone,
    courier: o.courier ?? null,
    tracking_number: o.tracking_number ?? null,
    delivered_at: o.delivered_at ?? null,
    return_reason: o.return_reason ?? null,
    cancel_reason: o.cancel_reason ?? null,
    subtotal: roundMoney(
      myItems.filter((it) => it.order_id === o.id).reduce((n, it) => n + it.unit_price * it.quantity, 0)
    ),
    pwdCheck: pwdCheck(o.id),
  }));

  return (
    <main id="main" tabIndex={-1} className="main--seller">
      <h1>Order fulfillment</h1>
      <SellerOrdersClient
        orders={lite}
        orderItems={myItems}
        products={products.map((p) => ({ id: p.id, title: p.title }))}
        variants={variants.map((v) => ({ id: v.id, color_name: v.color_name, size: v.size }))}
        buyers={Object.entries(names).map(([id, name]) => ({ id: Number(id), name: shortName(name) }))}
        history={history}
      />
    </main>
  );
}

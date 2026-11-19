import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { OrdersClient } from "@/components/OrdersClient";
import {
  getBuyerOrder,
  getDisplayNames,
  getOrderItemsForOrders,
  getOrderStatusHistoryForOrders,
  getProductThumbs,
  getReviewedProductIds,
  getVariantsByIds,
} from "@/lib/data";
import { getSettingInts } from "@/lib/settings";
import { buyerStatusText } from "@/lib/orders/state";
import { formatDate, formatDateTime, money } from "@/lib/format";
import { roundMoney } from "@/lib/pricing/core";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order details" };

/**
 * One order (C-21): what was bought and from whom, where it goes, how it is
 * paid, the price breakdown, the timeline with courier and tracking, and the
 * actions that apply now (pay, cancel, confirm received, return, review).
 * Only the buyer who placed it can open it.
 */
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["buyer"]);
  const { id } = await params;
  const order = await getBuyerOrder(session.user_id, Number(id));
  if (!order) notFound();

  const [items, history, reviewedProductIds, settings] = await Promise.all([
    getOrderItemsForOrders([order.id]),
    getOrderStatusHistoryForOrders([order.id]),
    getReviewedProductIds(session.user_id),
    getSettingInts({ return_window_days: 7 }),
  ]);
  const [products, variants] = await Promise.all([
    getProductThumbs(items.map((i) => i.product_id).filter((n): n is number => n != null)),
    getVariantsByIds(items.map((i) => i.variant_id).filter((n): n is number => n != null)),
  ]);
  const sellerIds = order.seller_id ? [order.seller_id] : [...new Set(products.map((p) => p.seller_id))];
  const sellerNames = await getDisplayNames(sellerIds);

  const itemsTotal = roundMoney(items.reduce((n, i) => n + Number(i.unit_price) * i.quantity, 0));
  const pwdDiscount = roundMoney(items.reduce((n, i) => n + Number(i.pwd_discount_amount ?? 0), 0));
  const shipping = Number(order.shipping_fee ?? 0);
  const returnUntil =
    order.order_status === "delivered" && order.delivered_at
      ? new Date(Date.parse(order.delivered_at) + settings.return_window_days * 86_400_000).toISOString()
      : null;

  return (
    <>
      <SiteHeader variant="buyer" active="orders" session={session} />
      <main id="main" tabIndex={-1} className="container main--orders">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/buyer/orders">My orders</Link> <span aria-hidden="true">/</span> Order #{order.id}
        </nav>
        <h1>Order #{order.id}</h1>
        <p className="lede">
          {buyerStatusText(order)} · placed {formatDateTime(order.created_at)}
        </p>
        {returnUntil && Date.parse(returnUntil) > Date.now() ? (
          <p className="notice notice--info">You can request a return until {formatDate(returnUntil)}.</p>
        ) : null}

        <OrdersClient
          single
          orders={[order]}
          orderItems={items}
          products={products.map((p) => ({ id: p.id, title: p.title, image: p.image, images: p.images }))}
          variants={variants.map((v) => ({ id: v.id, color_name: v.color_name, size: v.size }))}
          reviewedProductIds={reviewedProductIds}
          history={history}
        />

        <div className="order-detail">
          <section className="card" aria-labelledby="od-seller">
            <h2 id="od-seller">Seller</h2>
            <p>{sellerIds.map((sid) => sellerNames[sid] ?? "PWD seller").join(", ") || "PWD seller"}</p>
            <p>
              <Link className="btn btn--outline btn--sm" href="/buyer/messages">
                Message the seller
              </Link>
            </p>
          </section>

          <section className="card" aria-labelledby="od-delivery">
            <h2 id="od-delivery">Delivery</h2>
            <dl className="details-list">
              <dt>Name</dt>
              <dd>{order.shipping_name || "—"}</dd>
              <dt>Address</dt>
              <dd>{[order.shipping_address, order.shipping_city].filter(Boolean).join(", ") || "—"}</dd>
              <dt>Phone</dt>
              <dd>{order.shipping_phone || "—"}</dd>
              {order.courier || order.tracking_number ? (
                <>
                  <dt>Courier</dt>
                  <dd>{order.courier || "—"}</dd>
                  <dt>Tracking number</dt>
                  <dd className="mono">{order.tracking_number || "—"}</dd>
                </>
              ) : null}
            </dl>
          </section>

          <section className="card" aria-labelledby="od-payment">
            <h2 id="od-payment">Payment</h2>
            <dl className="details-list">
              <dt>Method</dt>
              <dd>{order.payment_provider === "paymongo" ? "Online (GCash, Maya, card)" : "Cash on delivery"}</dd>
              <dt>Status</dt>
              <dd>{order.payment_status === "paid" ? "Paid" : order.payment_status === "failed" ? "Not completed" : order.payment_status === "refunded" ? "Refunded" : order.payment_provider === "paymongo" ? "Waiting for payment" : "Pay on delivery"}</dd>
            </dl>
            <h3 className="order-detail__subhead">Price</h3>
            <dl className="details-list details-list--money">
              <dt>Items</dt>
              <dd>{money(itemsTotal + pwdDiscount)}</dd>
              {pwdDiscount > 0 ? (
                <>
                  <dt>PWD discount</dt>
                  <dd>−{money(pwdDiscount)}</dd>
                </>
              ) : null}
              <dt>Shipping</dt>
              <dd>{shipping ? money(shipping) : "Free"}</dd>
              <dt>Total</dt>
              <dd>
                <strong>{money(order.total_amount)}</strong>
              </dd>
            </dl>
            {order.refund_due ? <p className="notice notice--warning">A refund is due on this order. Our team will contact you.</p> : null}
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

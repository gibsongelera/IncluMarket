import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import {
  getDisplayNames,
  getOrderItemsForProducts,
  getOrdersByIds,
  getProductThumbs,
  getSellerProductIndex,
  getShopSettings,
  getVariantsByIds,
} from "@/lib/data";
import { verificationLast4 } from "@/lib/pwd/data";
import { variantLabel, roundMoney } from "@/lib/pricing/core";
import { formatDate, money } from "@/lib/format";
import { isPrepaid } from "@/lib/orders/state";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Packing slip" };

/**
 * A printable packing slip for one order (C-33): one A4 page, only this
 * seller's lines, the delivery address, and — for cash on delivery — the
 * amount to collect and the PWD ID check.
 */
export default async function PackingSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["seller"]);
  const orderId = Number((await params).id);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();

  const products = await getSellerProductIndex(session.user_id);
  const lines = (await getOrderItemsForProducts(products.map((p) => p.id))).filter((l) => l.order_id === orderId);
  if (!lines.length) notFound();
  const [[order], thumbs, variants, shop, names, last4] = await Promise.all([
    getOrdersByIds([orderId]),
    getProductThumbs(lines.map((l) => l.product_id).filter((n): n is number => n != null)),
    getVariantsByIds(lines.map((l) => l.variant_id).filter((n): n is number => n != null)),
    getShopSettings(session.user_id),
    getDisplayNames([session.user_id]),
    verificationLast4(lines.map((l) => l.verification_id ?? 0)),
  ]);
  if (!order) notFound();

  const title = (pid: number | null) => thumbs.find((t) => t.id === pid)?.title ?? "Item";
  const option = (vid: number | null) => {
    const v = variants.find((x) => x.id === vid);
    return v ? variantLabel(v.color_name, v.size) : "";
  };
  const linesTotal = roundMoney(lines.reduce((n, l) => n + Number(l.unit_price) * l.quantity, 0));
  // An order split per seller (0015) is wholly this seller's: collect its total.
  const ownsOrder = order.seller_id === session.user_id;
  const collect = ownsOrder ? Number(order.total_amount) : linesTotal;
  const cod = !isPrepaid(order.payment_provider);
  const pwd = lines.filter((l) => Number(l.pwd_discount_amount ?? 0) > 0);
  const pwdLast4 = pwd.find((l) => l.verification_id)?.verification_id;

  return (
    <main id="main" tabIndex={-1} className="main--seller">
      <p className="no-print">
        <Link href="/seller/orders">Back to orders</Link>
      </p>
      <article className="slip" aria-labelledby="slip-title">
        <header className="slip__head">
          <div>
            <p className="slip__shop">{shop.shopName || names[session.user_id] || "InclusiveMarket seller"}</p>
            <p className="muted">Sold on InclusiveMarket</p>
          </div>
          <div className="slip__order">
            <h1 id="slip-title">Packing slip</h1>
            <p>
              Order <strong>#{order.id}</strong>
              <br />
              {formatDate(order.created_at)}
            </p>
          </div>
        </header>

        <section className="slip__to" aria-label="Ship to">
          <h2>Ship to</h2>
          <p>
            <strong>{order.shipping_name}</strong>
            <br />
            {order.shipping_address}
            <br />
            {order.shipping_city}
            <br />
            {order.shipping_phone}
          </p>
        </section>

        <table className="slip__items">
          <caption className="sr-only">Items in this parcel</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Option</th>
              <th scope="col" className="num">
                Qty
              </th>
              <th scope="col" className="slip__check">
                Packed
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>{title(l.product_id)}</td>
                <td>{option(l.variant_id)}</td>
                <td className="num">{l.quantity}</td>
                <td className="slip__check" aria-label="Packed checkbox">
                  ☐
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="slip__pay" aria-label="Payment">
          {cod ? (
            <p>
              <strong>Cash on delivery: collect {money(collect)}.</strong>
            </p>
          ) : (
            <p>
              {order.payment_provider === "otc" ? "Paid to the Workshop" : "Paid online"}. Do not collect any payment.
            </p>
          )}
          {pwd.length ? (
            <p>
              PWD discount applied. Check the buyer&rsquo;s PWD ID on delivery
              {pwdLast4 && last4.get(pwdLast4) ? ` (ID ending ${last4.get(pwdLast4)})` : ""}.
            </p>
          ) : null}
        </section>

        <footer className="slip__foot muted">Thank you for supporting PWD makers from AVRC Region IX.</footer>
      </article>
      <p className="no-print">
        <PrintButton label="Print packing slip" />
      </p>
    </main>
  );
}

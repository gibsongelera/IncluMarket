import { requireRole } from "@/lib/session";
import { Chart } from "@/components/Chart";
import { Pill } from "@/components/Pill";
import { money, formatDate, shortName } from "@/lib/format";
import {
  getDisplayNames,
  getOrderItemsForProducts,
  getOrdersByIds,
  getSellerProductIndex,
  getVariantsForProducts,
} from "@/lib/data";
import { TableWrap } from "@/components/TableWrap";
import { VerificationStatus } from "@/components/VerificationStatus";
import { getMyVerification } from "@/lib/pwd/data";
import { sweepPwdVerifications } from "@/lib/pwd/sweep";

export const dynamic = "force-dynamic";

const ACTIVE = ["processing", "shipped", "delivered"];

export default async function SellerDashboardPage() {
  const session = await requireRole(["seller"]);
  await sweepPwdVerifications();
  // Unverified sellers must see, first thing, whether their listings are
  // live and until when (B-15, Q4).
  // A failed read here must not take the whole dashboard down with it.
  const verification = await getMyVerification(session.user_id).catch(() => null);
  // Scoped reads: this seller's products, the order lines for them, those
  // orders, and the names of those buyers. It used to read every order, every
  // line, every variant and every user in the system on each visit.
  const products = await getSellerProductIndex(session.user_id);
  const productIds = products.map((p) => p.id);
  const [myItems, variants] = await Promise.all([
    getOrderItemsForProducts(productIds),
    getVariantsForProducts(productIds),
  ]);
  const orders = await getOrdersByIds([...new Set(myItems.map((it) => it.order_id))]);
  const ordersById: Record<number, (typeof orders)[number]> = {};
  orders.forEach((o) => (ordersById[o.id] = o));
  const nameById = await getDisplayNames(orders.map((o) => o.buyer_id));
  // What this seller earns from an order: their own lines, not the order total.
  const mySubtotal: Record<number, number> = {};
  myItems.forEach((it) => (mySubtotal[it.order_id] = (mySubtotal[it.order_id] || 0) + it.unit_price * it.quantity));

  const now = Date.now();
  const monthAgo = now - 30 * 24 * 3600 * 1000;
  let revenue30 = 0;
  const orders30 = new Set<number>();
  let items30 = 0;
  myItems.forEach((it) => {
    const o = ordersById[it.order_id];
    if (!o) return;
    const t = new Date(o.created_at).getTime();
    if (t >= monthAgo && ACTIVE.includes(o.order_status)) {
      revenue30 += it.unit_price * it.quantity;
      orders30.add(o.id);
      items30 += it.quantity;
    }
  });
  const lowStock = variants.filter(
    (v) => productIds.includes(v.product_id) && v.stock_qty > 0 && v.stock_qty <= 5
  ).length;

  // Sales by week for last 12 weeks
  const weeks = 12;
  const buckets: { label: string; start: number; end: number; value: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - i * 7 - 6);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    end.setDate(end.getDate() - i * 7);
    buckets.push({ label: weeks - i + "w", start: start.getTime(), end: end.getTime(), value: 0 });
  }
  myItems.forEach((it) => {
    const o = ordersById[it.order_id];
    if (!o || !ACTIVE.includes(o.order_status)) return;
    const t = new Date(o.created_at).getTime();
    for (const b of buckets) {
      if (t >= b.start && t <= b.end) {
        b.value += it.unit_price * it.quantity;
        break;
      }
    }
  });

  // Turnover: units sold per product (30d)
  const perProduct: Record<number, { label: string; value: number }> = {};
  products.forEach(
    (p) =>
      (perProduct[p.id] = {
        label: p.title.slice(0, 12) + (p.title.length > 12 ? "…" : ""),
        value: 0,
      })
  );
  myItems.forEach((it) => {
    const o = ordersById[it.order_id];
    if (!o || it.product_id == null) return;
    const t = new Date(o.created_at).getTime();
    if (t >= monthAgo && perProduct[it.product_id]) perProduct[it.product_id].value += it.quantity;
  });
  const turnover = Object.values(perProduct)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Recent orders
  const mineOrders = Array.from(new Set(myItems.map((it) => it.order_id)))
    .map((id) => ordersById[id])
    .filter(Boolean)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8);

  return (
    <main id="main" tabIndex={-1} className="main--seller">
      <h1>Merchant dashboard</h1>
      {verification &&
      ((verification.state !== "verified" && verification.state !== "unavailable") ||
        (verification.renewalDue && !verification.pending)) ? (
        <VerificationStatus my={verification} role="seller" compact />
      ) : null}

      <section className="kpis" aria-label="Key metrics">
        <article className="kpi">
          <span className="kpi__label">Monthly revenue</span>
          <strong className="kpi__value">{money(revenue30)}</strong>
        </article>
        <article className="kpi">
          <span className="kpi__label">Orders (30d)</span>
          <strong className="kpi__value">{orders30.size}</strong>
        </article>
        <article className="kpi">
          <span className="kpi__label">Items sold (30d)</span>
          <strong className="kpi__value">{items30}</strong>
        </article>
        <article className="kpi">
          <span className="kpi__label">Low-stock variants</span>
          <strong className="kpi__value">{lowStock}</strong>
        </article>
      </section>

      <section className="chart-grid">
        <article className="chart-card">
          <h2>Sales volume (last 12 weeks)</h2>
          <Chart
            kind="line"
            ariaLabel="Weekly sales volume chart"
            currency
            data={[{ points: buckets.map((b) => ({ label: b.label, value: b.value })) }]}
          />
        </article>
        <article className="chart-card">
          <h2>Inventory turnover by product</h2>
          <Chart kind="bar" ariaLabel="Inventory turnover chart" data={turnover} color="var(--brand-brown)" />
        </article>
      </section>

      <section className="recent">
        <h2>Recent orders</h2>
        {mineOrders.length === 0 ? (
          <p className="empty">No recent orders.</p>
        ) : (
          <TableWrap label="Recent orders">
            <table className="data-table data-table--cards" aria-label="Recent orders">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Buyer</th>
                  <th>Placed</th>
                  <th>Your items</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {mineOrders.map((o) => (
                  <tr key={o.id}>
                    <td>#{o.id}</td>
                    <td>{shortName(nameById[o.buyer_id])}</td>
                    <td>{formatDate(o.created_at)}</td>
                    <td>{money(mySubtotal[o.id] || 0)}</td>
                    <td>
                      <Pill status={o.order_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>
    </main>
  );
}

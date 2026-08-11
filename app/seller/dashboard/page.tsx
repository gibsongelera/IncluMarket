import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Chart } from "@/components/Chart";
import { Pill } from "@/components/Pill";
import { money, formatDate } from "@/lib/format";
import {
  getOrderItems,
  getOrders,
  getProductsBySeller,
  getProfiles,
  getVariants,
} from "@/lib/data";

export const dynamic = "force-dynamic";

const ACTIVE = ["processing", "shipped", "delivered"];

export default async function SellerDashboardPage() {
  const session = await requireRole(["seller"]);
  const [products, orderItems, orders, variants, profiles] = await Promise.all([
    getProductsBySeller(session.user_id),
    getOrderItems(),
    getOrders(),
    getVariants(),
    getProfiles(),
  ]);

  const productIds = products.map((p) => p.id);
  const myItems = orderItems.filter((it) => it.product_id != null && productIds.includes(it.product_id));
  const ordersById: Record<number, (typeof orders)[number]> = {};
  orders.forEach((o) => (ordersById[o.id] = o));
  const nameById: Record<number, string> = {};
  profiles.forEach((p) => (nameById[p.id] = p.name));

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
    <>
      <SiteHeader variant="seller" active="dashboard" session={session} />
      <main id="main" tabIndex={-1} className="container main--seller">
        <h1>Merchant dashboard</h1>

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
            <Chart kind="bar" ariaLabel="Inventory turnover chart" data={turnover} color="#EE1C25" />
          </article>
        </section>

        <section className="recent">
          <h2>Recent orders</h2>
          {mineOrders.length === 0 ? (
            <p className="empty">No recent orders.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table" aria-label="Recent orders">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Buyer</th>
                    <th>Placed</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {mineOrders.map((o) => (
                    <tr key={o.id}>
                      <td>#{o.id}</td>
                      <td>{nameById[o.buyer_id] || "Buyer"}</td>
                      <td>{formatDate(o.created_at)}</td>
                      <td>{money(o.total_amount)}</td>
                      <td>
                        <Pill status={o.order_status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

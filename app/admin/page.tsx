import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getAdminOverview, type OverviewCount } from "@/lib/admin-overview";
import { getAdminAnalytics, type AnalyticsKpi } from "@/lib/admin-analytics";
import { sweepPwdVerifications } from "@/lib/pwd/sweep";
import { expireStalePayments } from "@/lib/payments/stock";
import { Chart } from "@/components/Chart";
import { Icon } from "@/components/Icon";
import { KpiCard, type KpiIconTone } from "@/components/KpiCard";
import { Pill } from "@/components/Pill";
import { SalesOverview } from "@/components/SalesOverview";
import { TableWrap } from "@/components/TableWrap";
import { rangeSummary } from "@/lib/kpi";
import { formatDate, initials, money, moneyWhole, svgPlaceholder } from "@/lib/format";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

/** The KPI row (03 §4): each card's icon tile, its sparkline's words, and its words when there is no figure yet. */
const KPI_LOOK: Record<AnalyticsKpi["key"], { icon: string; tone: KpiIconTone; spark?: string; none: string }> = {
  gross: { icon: "wallet", tone: "blue", spark: "Daily gross sales", none: "No sales in the last 30 days" },
  orders: { icon: "receipt", tone: "teal", spark: "Daily orders", none: "No orders in the last 30 days" },
  average: { icon: "chart", tone: "brown", spark: "Daily average order value", none: "No orders in the last 30 days" },
  returns: { icon: "undo", tone: "warn", none: "No deliveries in the last 30 days" },
};

/** "Needs attention": an icon per queue, by lib/admin-overview.ts todo key. */
const TODO_ICON: Record<string, string> = {
  products: "box",
  verifications: "shield",
  flags: "flag",
  proofs: "receipt",
  payouts: "wallet",
  refunds: "receipt",
  returns: "undo",
  tickets: "chat",
  privacy: "lock",
  contact: "message-circle",
};

/** "The shop": an icon tile per health count, by lib/admin-overview.ts health key. */
const HEALTH_LOOK: Record<string, { icon: string; tone: KpiIconTone }> = {
  orders: { icon: "cart", tone: "teal" },
  users: { icon: "user", tone: "blue" },
  sellers: { icon: "users", tone: "brown" },
  live: { icon: "box", tone: "ok" },
};

const PERCENT = { style: "percent", maximumFractionDigits: 1 } as const;

/** A KPI figure as its card shows it: whole pesos, a grouped count, a percentage to one decimal. */
function figure(format: AnalyticsKpi["format"], n: number): string {
  if (format === "money") return moneyWhole(n);
  if (format === "percent") return n.toLocaleString("en-PH", PERCENT);
  return n.toLocaleString("en-PH");
}

/** "2026-11-14" → "11/14". A Manila day key is already Manila's date: no time zone maths. */
function shortDay(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return m && d ? `${m}/${d}` : key;
}

const finite = (v: number | null): v is number => typeof v === "number" && Number.isFinite(v);

/** One of the four figures (03 §4). A figure that is none yet (no orders to average) says so; one that could not be read says "Needs a database update". */
function Kpi({ k }: { k: AnalyticsKpi }) {
  const look = KPI_LOOK[k.key];
  const value = k.unavailable ? null : k.value;
  return (
    <KpiCard
      label={k.label}
      value={value === null ? null : figure(k.format, value)}
      empty={k.unavailable ? undefined : look.none}
      href={k.href}
      icon={look.icon}
      tone={look.tone}
      // No previous figure (a clipped read) gives no trend line.
      trend={{ current: k.value, previous: k.previous, good: k.goodWhen, period: "previous 30 days" }}
      spark={
        look.spark && k.series.filter(finite).length >= 2
          ? { values: k.series, summary: rangeSummary(look.spark, k.series, (n) => figure(k.format, n)) }
          : undefined
      }
    />
  );
}

/** "The shop": one health count as a link row. The spaces keep the link's name in words ("Active sellers 12"); the "—" of a count that could not be read is hidden, its words are not. */
function HealthRow({ h }: { h: OverviewCount }) {
  const look = HEALTH_LOOK[h.key] ?? { icon: "chart", tone: "blue" };
  return (
    <Link className="health-list__link" href={h.href}>
      <span className={`kpi__icon kpi__icon--${look.tone}`} aria-hidden="true">
        <Icon name={look.icon} />
      </span>{" "}
      <span className="health-list__label">{h.label}</span>{" "}
      {h.count === null ? (
        <>
          <strong className="health-list__count" aria-hidden="true">
            —
          </strong>{" "}
          <span className="health-list__note small muted">Needs a database update</span>
        </>
      ) : (
        <strong className="health-list__count">{h.count.toLocaleString("en-PH")}</strong>
      )}
    </Link>
  );
}

/** A dashboard card's title and subtitle: the left side of its .chart-card__head. */
function CardTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2>{title}</h2>
      <p className="chart-card__subtitle">{subtitle}</p>
    </div>
  );
}

/** A widget with nothing to show yet: its words in the designed empty state, never a blank chart (03 §4). */
function Empty({ children }: { children: string }) {
  return <p className="empty">{children}</p>;
}

/**
 * A widget whose read needs a migration this database lacks (its field of
 * the analytics is null). Every read here needs at most 0015 (order
 * subtotals and shops), after 0010 (payment status) and 0014 (delivery and
 * return dates).
 */
function Unavailable() {
  return (
    <div className="empty">
      <p>
        <strong>Needs a database update</strong>
      </p>
      <p>These figures need database migration 0015.</p>
    </div>
  );
}

/**
 * Admin → Overview, the admin's home (C-37, N-34; 03 §2): the head with
 * "Download report", what needs doing (the queue counts), the four figures
 * of the last 30 days, then the sales chart beside the order-status donut,
 * the top products beside sales by category, and the recent orders beside
 * the shop's health counts. Every number is a link or sits in a row that
 * links to the list behind it; every widget has its own empty and
 * unavailable state. Names and figures only: no email reaches this page.
 */
export default async function AdminOverviewPage() {
  await requireRole(["admin"]);
  // Time-based upkeep runs from here too (no scheduler on this deployment).
  await Promise.all([sweepPwdVerifications(), expireStalePayments()]);
  // Not caught: getAdminAnalytics() checks the admin role itself (a redirect
  // is a throw), and an outage must reach app/admin/error.tsx rather than
  // look like a quiet month.
  const [{ todo, health }, analytics] = await Promise.all([getAdminOverview(), getAdminAnalytics()]);
  const { kpis, partial, sales, status, topProducts, byCategory, recentOrders } = analytics;
  const waiting = todo.filter((t) => (t.count ?? 0) > 0);
  const anySales = sales !== null && (sales.revenue.some((v) => v > 0) || sales.orders.some((v) => v > 0));
  const statusTotal = status?.reduce((n, s) => n + s.count, 0) ?? 0;
  const salesTitle = (
    <CardTitle title="Sales (last 30 days)" subtitle="Confirmed orders per day: processing, shipped or delivered" />
  );

  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Overview</h1>
          <p className="muted">What needs you today and how the shop is doing</p>
          <p className="page-head__org small">
            {SITE.workshop.name} · under {SITE.workshop.under}
          </p>
        </div>
        <Link className="btn btn--primary" href="/admin/reports">
          <Icon name="download" size={18} /> Download report
        </Link>
      </div>

      <section aria-labelledby="ov-todo">
        <div className="section-head">
          <h2 id="ov-todo">Needs attention</h2>
        </div>
        <p className="muted">
          {waiting.length
            ? `${waiting.length} kind${waiting.length === 1 ? "" : "s"} of task waiting.`
            : "Nothing waiting right now."}
        </p>
        <ul className="kpis" role="list">
          {todo.map((t) => (
            <li key={t.key}>
              <KpiCard label={t.label} value={t.count} href={t.href} icon={TODO_ICON[t.key] ?? "bell"} queue />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ov-figures">
        {/* Hidden, so the figures are not read as part of "Needs attention" in the heading outline. */}
        <h2 id="ov-figures" className="sr-only">
          Key figures, last 30 days
        </h2>
        <ul className="kpis" role="list">
          {kpis.map((k) => (
            <li key={k.key}>
              <Kpi k={k} />
            </li>
          ))}
        </ul>
        {partial ? (
          <p className="kpis-note muted small">These figures cover the newest 20,000 orders, so they show no trend.</p>
        ) : null}
      </section>

      <div className="dash-grid">
        <section className="chart-card span-8">
          {sales !== null && anySales ? (
            <SalesOverview
              heading={salesTitle}
              revenue={sales.labels.map((day, i) => ({ label: shortDay(day), value: sales.revenue[i] ?? 0 }))}
              orders={sales.labels.map((day, i) => ({ label: shortDay(day), value: sales.orders[i] ?? 0 }))}
            />
          ) : (
            <>
              <div className="chart-card__head">{salesTitle}</div>
              {sales === null ? <Unavailable /> : <Empty>No orders in the last 30 days</Empty>}
            </>
          )}
        </section>

        <section className="chart-card span-4">
          <div className="chart-card__head">
            <CardTitle title="Orders by status" subtitle="Orders placed in the last 30 days" />
          </div>
          {status === null ? (
            <Unavailable />
          ) : statusTotal === 0 ? (
            <Empty>No orders in the last 30 days</Empty>
          ) : (
            <Chart
              kind="donut"
              ariaLabel="Orders by status, last 30 days"
              labelHeading="Status"
              valueLabel="Orders"
              unit={["order", "orders"]}
              empty="No orders in the last 30 days"
              data={status.map((s) => ({ label: s.label, value: s.count, status: s.status }))}
            />
          )}
        </section>

        <section className="chart-card span-8">
          <div className="chart-card__head">
            <CardTitle title="Top selling products" subtitle="By units sold in the last 30 days" />
          </div>
          {topProducts === null ? (
            <Unavailable />
          ) : topProducts.length === 0 ? (
            <Empty>No sales in the last 30 days</Empty>
          ) : (
            <TableWrap label="Top selling products">
              <table className="data-table data-table--cards" aria-label="Top selling products">
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Product</th>
                    <th scope="col">Shop</th>
                    <th scope="col" className="num">
                      Units
                    </th>
                    <th scope="col" className="num">
                      Revenue
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={p.id}>
                      <td>{i + 1}</td>
                      <td>
                        <div className="cell-identity">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className="cell-identity__thumb"
                            src={p.image || svgPlaceholder()}
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                          <span className="cell-identity__text">
                            {/* status=all: the list opens on "pending", where a
                                product that sells is not, so ?focus= found
                                nothing (P2-03 a11y review, 2.4.4). */}
                            <Link className="cell-identity__name" href={`/admin/products?status=all&focus=${p.id}`}>
                              {p.title}
                            </Link>
                            <span className="cell-identity__meta">{p.category}</span>
                          </span>
                        </div>
                      </td>
                      <td>{p.shop || "Unknown shop"}</td>
                      <td className="num">{p.units.toLocaleString("en-PH")}</td>
                      <td className="num">{money(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </section>

        <section className="chart-card span-4">
          <div className="chart-card__head">
            <CardTitle title="Sales by category" subtitle="Gross sales in the last 30 days" />
          </div>
          {byCategory === null ? (
            <Unavailable />
          ) : byCategory.length === 0 ? (
            <Empty>No sales in the last 30 days</Empty>
          ) : (
            <Chart
              kind="hbar"
              currency
              ariaLabel="Sales by category, last 30 days"
              labelHeading="Category"
              valueLabel="Gross sales"
              empty="No sales in the last 30 days"
              data={byCategory}
            />
          )}
        </section>

        <section className="chart-card span-8">
          <div className="chart-card__head">
            <CardTitle title="Recent orders" subtitle="The newest orders, any status" />
            <Link className="section-head__link" href="/admin/orders">
              View all orders <Icon name="arrow-right" />
            </Link>
          </div>
          {recentOrders === null ? (
            <Unavailable />
          ) : recentOrders.length === 0 ? (
            <Empty>No orders yet</Empty>
          ) : (
            <TableWrap label="Recent orders">
              <table className="data-table data-table--cards" aria-label="Recent orders">
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Buyer</th>
                    <th scope="col">Shop</th>
                    <th scope="col" className="num">
                      Amount
                    </th>
                    <th scope="col">Payment</th>
                    <th scope="col">Status</th>
                    <th scope="col">Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((o) => (
                    <tr key={o.id}>
                      <td className="cell-code">
                        {/* The search behind it is P2-07's; the name says what "#1024" is. */}
                        <Link href={`/admin/orders?q=${o.id}`} aria-label={`Order #${o.id}`}>
                          #{o.id}
                        </Link>
                      </td>
                      <td>
                        <div className="cell-identity">
                          {o.buyer ? (
                            <span className="avatar" aria-hidden="true">
                              {initials(o.buyer)}
                            </span>
                          ) : null}
                          <span className="cell-identity__text">
                            <span className="cell-identity__name">{o.buyer || "Unknown buyer"}</span>
                          </span>
                        </div>
                      </td>
                      <td>{o.shop || "Unknown shop"}</td>
                      <td className="num">{money(o.amount)}</td>
                      <td>{o.paymentStatus ? <Pill status={o.paymentStatus} /> : "Not recorded"}</td>
                      <td>
                        <Pill status={o.orderStatus} />
                      </td>
                      <td>{formatDate(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </section>

        <section className="chart-card span-4">
          <div className="chart-card__head">
            <CardTitle title="The shop" subtitle="This week and right now" />
          </div>
          <ul className="health-list" role="list">
            {health.map((h) => (
              <li key={h.key}>
                <HealthRow h={h} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

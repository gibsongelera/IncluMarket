import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getSellerDashboard, type SellerKpi } from "@/lib/seller-analytics";
import { LOW_STOCK_MAX, WEEKS } from "@/lib/analytics/seller";
import { sweepPwdVerifications } from "@/lib/pwd/sweep";
import { Chart } from "@/components/Chart";
import { Icon } from "@/components/Icon";
import { KpiCard, type KpiIconTone } from "@/components/KpiCard";
import { Pill } from "@/components/Pill";
import { SalesOverview } from "@/components/SalesOverview";
import { SellerTodos } from "@/components/SellerTodos";
import { StarRating } from "@/components/StarRating";
import { TableWrap } from "@/components/TableWrap";
import { VerificationStatus } from "@/components/VerificationStatus";
import { rangeSummary } from "@/lib/kpi";
import { formatDate, money, moneyWhole, svgPlaceholder } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

/** The KPI row (04 §3): each card's words, its icon tile and its sparkline's words. The words are used when the figure could not be read. */
const KPI_LOOK: Record<SellerKpi["key"], { label: string; href: string; icon: string; tone: KpiIconTone; spark: string }> = {
  sales: { label: "Sales (last 30 days)", href: "/seller/finance", icon: "chart", tone: "blue", spark: "Daily sales" },
  orders: { label: "Orders (last 30 days)", href: "/seller/orders", icon: "receipt", tone: "teal", spark: "Daily orders" },
  itemsSold: { label: "Items sold (last 30 days)", href: "/seller/orders", icon: "box", tone: "brown", spark: "Items sold per day" },
};

/** The friendly empty state of a widget with nothing yet (04 §3). */
const WHEN_A_BUYER_ORDERS = "When a buyer orders, it shows here.";

/** A KPI figure as its card shows it: whole pesos (01 §6.1) or a grouped count. */
function figure(format: SellerKpi["format"], n: number): string {
  return format === "money" ? moneyWhole(n) : n.toLocaleString("en-PH");
}

/** The words under the "—" of a figure that could not be read: the migration it waits for, when that is why. */
function unreadWords(migration: string | undefined): string {
  return migration ? `Needs a database update (migration ${migration})` : "Could not load this right now";
}

/**
 * One of the three order figures. Its trend is against the 30 days before
 * (none when the orders were clipped: `previous` is null then); its
 * sparkline only when some day had a figure, so a new shop sees no flat line
 * of zeros (04 §7).
 */
function Kpi({ slot, k, migration }: { slot: SellerKpi["key"]; k: SellerKpi | null; migration?: string }) {
  const look = KPI_LOOK[slot];
  if (!k) {
    return (
      <KpiCard
        label={look.label}
        value={null}
        empty={unreadWords(migration)}
        href={look.href}
        icon={look.icon}
        tone={look.tone}
      />
    );
  }
  return (
    <KpiCard
      label={k.label}
      value={figure(k.format, k.value)}
      href={k.href}
      icon={look.icon}
      tone={look.tone}
      trend={{ current: k.value, previous: k.previous, good: k.goodWhen, period: "previous 30 days" }}
      spark={
        k.series.length >= 2 && k.series.some((v) => v > 0)
          ? { values: k.series, summary: rangeSummary(look.spark, k.series, (n) => figure(k.format, n)) }
          : undefined
      }
    />
  );
}

/** A dashboard card's title and subtitle: the left side of its .chart-card__head (as on the admin overview). */
function CardTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2>{title}</h2>
      <p className="chart-card__subtitle">{subtitle}</p>
    </div>
  );
}

/** A widget with nothing to show yet, in plain words: never a blank chart or a table of zeros (04 §3). */
function Empty({ children }: { children: string }) {
  return <p className="empty">{children}</p>;
}

/**
 * A widget that could not be read (its field of the DTO is null): the
 * migration it waits for when `degraded` names one, else a failed read.
 */
function Unavailable({ migration }: { migration?: string }) {
  return (
    <div className="empty">
      {migration ? (
        <>
          <p>
            <strong>Needs a database update</strong>
          </p>
          <p>This needs database migration {migration}.</p>
        </>
      ) : (
        <>
          <p>
            <strong>Could not load this right now</strong>
          </p>
          <p>Try again in a moment.</p>
        </>
      )}
    </div>
  );
}

/**
 * Seller Centre → Dashboard (04 §2): what to fix, how the shop is doing,
 * what sells, what is running out and what happened recently, top to bottom.
 *
 * 1. "Dashboard", its line, and "Add a product"; the PWD verification
 *    banner while it is needed.
 * 2. The setup checklist until it is complete, then the to-do counts.
 * 3. Sales, orders and items sold for the last 30 days, and Ready to
 *    withdraw with what is still on the way.
 * 4. Sales by week for 12 weeks (Sales / Orders) beside this seller's
 *    orders by status, whose legend links to each filtered list.
 * 5. Best sellers beside Running low.
 * 6. Recent orders beside the latest reviews.
 *
 * Every figure comes from getSellerDashboard() (lib/seller-analytics.ts),
 * scoped to the session's seller: this page computes none. Each widget has
 * its own empty state (nothing yet) and its own unavailable state (null:
 * could not be read, naming the migration when that is why). Short names
 * and figures only: no email, phone number or address reaches this page.
 */
export default async function SellerDashboardPage() {
  await requireRole(["seller"]);
  // Time-based upkeep (no scheduler): expiries and grace periods are settled
  // before the verification below is read.
  await sweepPwdVerifications();
  const d = await getSellerDashboard();
  const { kpis, weekly, status, bestSellers, runningLow, recentOrders, latestReviews, verification, degraded } = d;
  const anySales = weekly !== null && weekly.some((w) => w.sales > 0 || w.orders > 0);
  const ready = kpis.readyToWithdraw;
  const salesTitle = (
    <CardTitle
      title={`Sales, last ${WEEKS} weeks`}
      subtitle="Confirmed orders each week: processing, shipped or delivered"
    />
  );

  return (
    <main id="main" tabIndex={-1} className="main--seller">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Dashboard</h1>
          <p className="muted">How your shop is doing and what to do next</p>
        </div>
        {/* P3-03 makes ?new=1 open the product wizard; until then it opens the list, whose first button adds one. */}
        <Link className="btn btn--primary" href="/seller/products?new=1">
          <Icon name="plus" size={18} /> Add a product
        </Link>
      </div>

      {/* Unverified sellers must see, first thing, whether their listings are
          live and until when (B-15, Q4). A verification that could not be
          read (null) shows no banner, as before. */}
      {verification &&
      ((verification.state !== "verified" && verification.state !== "unavailable") ||
        (verification.renewalDue && !verification.pending)) ? (
        <VerificationStatus my={verification} role="seller" compact />
      ) : null}

      <SellerTodos todo={d.todo} setup={d.setup} />

      <section aria-labelledby="sd-figures">
        {/* Hidden, so the figures are not read as part of "Things to do" in the heading outline. */}
        <h2 id="sd-figures" className="sr-only">
          How your shop is doing, last 30 days
        </h2>
        <ul className="kpis" role="list">
          <li>
            <Kpi slot="sales" k={kpis.sales} migration={degraded.sales} />
          </li>
          <li>
            <Kpi slot="orders" k={kpis.orders} migration={degraded.orders} />
          </li>
          <li>
            <Kpi slot="itemsSold" k={kpis.itemsSold} migration={degraded.itemsSold} />
          </li>
          <li>
            {/* A balance, not a trend: no comparison and no sparkline. */}
            <KpiCard
              label="Ready to withdraw"
              value={ready ? moneyWhole(ready.available) : null}
              note={ready ? `${moneyWhole(ready.pending)} still on the way` : undefined}
              empty={ready ? undefined : unreadWords(degraded.readyToWithdraw)}
              href={ready?.href ?? "/seller/finance"}
              icon="wallet"
              tone="ok"
            />
          </li>
        </ul>
        {d.partial ? (
          <p className="kpis-note muted small">Some of your oldest orders could not be counted, so these figures show no trend.</p>
        ) : null}
      </section>

      <div className="dash-grid">
        <section className="chart-card span-8">
          {weekly !== null && anySales ? (
            <SalesOverview
              heading={salesTitle}
              moneyLabel="Sales"
              step="Week"
              span={`last ${WEEKS} weeks`}
              idPrefix="sd-sales"
              revenue={weekly.map((w) => ({ label: w.label, value: w.sales }))}
              orders={weekly.map((w) => ({ label: w.label, value: w.orders }))}
            />
          ) : (
            <>
              <div className="chart-card__head">{salesTitle}</div>
              {weekly === null ? (
                <Unavailable migration={degraded.weekly} />
              ) : (
                <Empty>{`No sales in the last ${WEEKS} weeks. ${WHEN_A_BUYER_ORDERS}`}</Empty>
              )}
            </>
          )}
        </section>

        <section className="chart-card span-4">
          <div className="chart-card__head">
            <CardTitle title="Your orders by status" subtitle="Orders placed in the last 30 days" />
          </div>
          {status === null ? (
            <Unavailable migration={degraded.status} />
          ) : status.total === 0 ? (
            <Empty>{`No orders in the last 30 days. ${WHEN_A_BUYER_ORDERS}`}</Empty>
          ) : (
            <Chart
              kind="donut"
              ariaLabel="Your orders by status, last 30 days"
              labelHeading="Status"
              valueLabel="Orders"
              unit={["order", "orders"]}
              empty="No orders in the last 30 days"
              // A legend item with orders links to your orders in that
              // status; a zero is plain text, not a link to an empty list.
              data={status.byStatus.map((s) => ({
                label: s.label,
                value: s.count,
                status: s.status,
                href: s.count > 0 ? `/seller/orders?status=${encodeURIComponent(s.status)}` : undefined,
              }))}
            />
          )}
        </section>

        <section className="chart-card span-8">
          <div className="chart-card__head">
            <CardTitle title="Best sellers" subtitle="By items sold in the last 30 days" />
          </div>
          {bestSellers === null ? (
            <Unavailable migration={degraded.bestSellers} />
          ) : bestSellers.length === 0 ? (
            <Empty>{`No sales in the last 30 days. ${WHEN_A_BUYER_ORDERS}`}</Empty>
          ) : (
            <TableWrap label="Best sellers">
              <table className="data-table data-table--cards" aria-label="Best sellers">
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Product</th>
                    <th scope="col" className="num">
                      Items sold
                    </th>
                    <th scope="col" className="num">
                      Sales
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bestSellers.map((p, i) => (
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
                            {/* A product is edited from its row on the products
                                list (the wizard opens from its Edit button);
                                ?focus= takes you to that row. */}
                            <Link className="cell-identity__name" href={`/seller/products?focus=${p.id}`}>
                              {p.title}
                            </Link>
                          </span>
                        </div>
                      </td>
                      <td className="num">{p.units.toLocaleString("en-PH")}</td>
                      <td className="num">{money(p.sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </section>

        <section className="chart-card span-4">
          <div className="chart-card__head">
            <CardTitle title="Running low" subtitle={`Options with ${LOW_STOCK_MAX} or fewer left`} />
          </div>
          {runningLow === null ? (
            <Unavailable migration={degraded.runningLow} />
          ) : runningLow.total === 0 ? (
            <Empty>{`Nothing is running low. Options with ${LOW_STOCK_MAX} or fewer left show here.`}</Empty>
          ) : (
            <>
              <ul className="stock-list" role="list">
                {runningLow.items.map((it) => (
                  <li key={it.variantId} className="stock-list__item">
                    <span className="stock-list__text">
                      <span className="stock-list__name">{it.productTitle}</span>
                      <span className="stock-list__option">{it.option}</span>
                    </span>
                    <strong className="stock-list__left">{it.left} left</strong>
                    <Link className="stock-list__link" href={`/seller/products?focus=${it.productId}`}>
                      Update stock<span className="sr-only">: {it.productTitle}, {it.option}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {runningLow.total > runningLow.items.length ? (
                <p className="stock-list__more muted small">and {runningLow.total - runningLow.items.length} more</p>
              ) : null}
            </>
          )}
        </section>

        <section className="chart-card span-8">
          <div className="chart-card__head">
            <CardTitle title="Recent orders" subtitle="Your newest orders, any status" />
            <Link className="section-head__link" href="/seller/orders">
              View all<span className="sr-only">&nbsp;orders</span> <Icon name="arrow-right" />
            </Link>
          </div>
          {recentOrders === null ? (
            <Unavailable migration={degraded.recentOrders} />
          ) : recentOrders.length === 0 ? (
            <Empty>{`No orders yet. ${WHEN_A_BUYER_ORDERS}`}</Empty>
          ) : (
            <TableWrap label="Recent orders">
              <table className="data-table data-table--cards" aria-label="Recent orders">
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Buyer</th>
                    <th scope="col">Placed</th>
                    <th scope="col" className="num">
                      Your items
                    </th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((o) => (
                    <tr key={o.id}>
                      <td className="cell-code">
                        {/* ?focus= takes you to the order's row on your orders list. */}
                        <Link href={`/seller/orders?focus=${o.id}`} aria-label={`Order #${o.id}`}>
                          #{o.id}
                        </Link>
                      </td>
                      <td>{o.buyer}</td>
                      <td>{formatDate(o.createdAt)}</td>
                      <td className="num">{money(o.amount)}</td>
                      <td>
                        <Pill status={o.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </section>

        <section className="chart-card span-4">
          <div className="chart-card__head">
            <CardTitle title="Latest reviews" subtitle="What buyers said most recently" />
            <Link className="section-head__link" href="/seller/reviews">
              View all<span className="sr-only">&nbsp;reviews</span> <Icon name="arrow-right" />
            </Link>
          </div>
          {latestReviews === null ? (
            <Unavailable migration={degraded.latestReviews} />
          ) : latestReviews.length === 0 ? (
            <Empty>No reviews yet. Buyers can review an order once it is delivered.</Empty>
          ) : (
            <ul className="review-list" role="list">
              {latestReviews.map((r) => (
                <li key={r.id} className="review-mini">
                  <p className="review-mini__rating">
                    {/* The stars are named "4 out of 5 stars"; the figure beside them repeats it for the eye. */}
                    <StarRating score={r.rating} /> <span aria-hidden="true">{r.rating}</span>
                  </p>
                  {r.comment ? (
                    <p className="review-mini__text">{r.comment}</p>
                  ) : (
                    <p className="review-mini__text muted">No written review.</p>
                  )}
                  <p className="review-mini__product">{r.productTitle}</p>
                  <p className="muted small">
                    {r.reviewer} · {formatDate(r.createdAt)}
                  </p>
                  {r.replied ? (
                    <p className="review-mini__state small">You replied</p>
                  ) : (
                    <Link className="review-mini__reply" href="/seller/reviews">
                      {/* A no-break space: .sr-only is absolutely positioned, so a
                          plain leading space would collapse into "Replyto". */}
                      Reply<span className="sr-only">&nbsp;to {r.reviewer} about {r.productTitle}</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

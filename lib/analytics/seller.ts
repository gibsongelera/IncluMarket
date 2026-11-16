import type * as Aggregate from "./aggregate";
import type { LineRow, OrderRow } from "./aggregate";
import type { DayRange, Range } from "./windows";

/**
 * The seller dashboard's widgets from plain rows (04 §3–§4): the KPI row,
 * sales by week, orders by status, best sellers, running low, recent orders
 * and the latest reviews. lib/seller-analytics.ts reads the rows, scoped to
 * the signed-in seller, and hands them here.
 *
 * Pure, with no runtime imports (`import type` is erased), so tests import
 * this file by its .ts path. That is also why the counting rule is passed
 * in rather than imported: Node needs a file extension that tsc here does
 * not allow (see lib/analytics/aggregate.ts). Callers pass the module
 * lib/analytics/aggregate.ts itself, not a copy of it, so a seller's "Sales
 * (last 30 days)" is the admin's gross sales rule (orderGross over counted
 * orders created in the window) applied to that seller's orders, and the
 * sellers' figures add up to the admin's for orders that carry a seller_id
 * (migration 0015: one order per seller). Ranges come from
 * lib/analytics/windows.ts the same way, and the words (statusLabel,
 * variantLabel, shortName) from lib/format.ts and lib/pricing/core.ts.
 *
 * Plain numbers and words: names are already short, and no email, phone or
 * address is ever among the inputs.
 */

/** lib/analytics/aggregate.ts, passed in (see above). */
export type AggregateModule = typeof Aggregate;

/** Weeks in the sales chart; 12 × 7 = 84 days, which covers the 30-day window and the 30 before it. */
export const WEEKS = 12;
/** Best sellers shown. */
export const BEST_SELLERS = 8;
/** "Running low": an option with 1 to this many left (0 is sold out, a different job). */
export const LOW_STOCK_MAX = 5;
/** Running-low options listed; the total counts them all. */
export const RUNNING_LOW = 8;
/** Recent orders shown. */
export const RECENT_ORDERS = 8;
/** Latest reviews shown. */
export const LATEST_REVIEWS = 3;
/** About how long a review's first line may be, the "…" included. */
export const FIRST_LINE = 120;

/** An im_orders row as the seller dashboard reads it. */
export interface SellerOrderRow extends OrderRow {
  buyer_id: number;
}

/** A week block from weekBlocks(): [start, end) and its first and last Manila day. */
export interface WeekBlock extends Range {
  firstDay: string;
  lastDay: string;
}

/** The spans every widget is counted over, from lib/analytics/windows.ts. */
export interface SellerSpans {
  /** The 30 Manila days ending with today. */
  current: Range;
  /** The 30 days before them. */
  previous: Range;
  /** The current window by Manila day, oldest first. */
  days: readonly DayRange[];
  /** WEEKS blocks of seven Manila days, oldest first, the last ending with today. */
  weeks: readonly WeekBlock[];
}

export interface ProductLite {
  id: number;
  title: string;
}

/** The im_product_variants columns Running low reads (lib/types.ts ProductVariant). */
export interface VariantRow {
  id: number;
  product_id: number;
  color_name: string | null;
  size: string | null;
  stock_qty: number | string;
}

/** A review as lib/reviews.ts getReviewsLite gives it (the reviewer's name already short). */
export interface ReviewRow {
  id: number;
  productId: number;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewer: string;
  sellerReply: string | null;
}

/** One KPI card's figures, in the shape app/admin/page.tsx turns into a KpiCard. */
export interface SellerKpi {
  key: "sales" | "orders" | "itemsSold";
  label: string;
  /** The current window's figure. */
  value: number;
  /** The previous window's figure, for the trend; null when the read was clipped (`partial`). */
  previous: number | null;
  /** money: pesos; count: a whole number. */
  format: "money" | "count";
  goodWhen: "up";
  /** One value per Manila day of the current window, oldest first, for the sparkline. */
  series: number[];
  href: string;
}

export interface SellerWeek {
  firstDay: string;
  lastDay: string;
  /** "11/4–11/10": the block's first and last day. */
  label: string;
  /** Gross sales of the counted orders created in the week. */
  sales: number;
  /** Counted orders created in the week. */
  orders: number;
}

export interface SellerStatus {
  /** Every order created in the window, any status. */
  total: number;
  /** By order_status, zeros kept, with the words the status pill shows. */
  byStatus: { status: string; label: string; count: number }[];
}

export interface BestSeller {
  id: number;
  title: string;
  /** The product's first photo; null when it has none (or it could not be read). */
  image: string | null;
  /** Units over the counted orders created in the window. */
  units: number;
  /** Σ unit_price × quantity of those units. */
  sales: number;
}

export interface RunningLowItem {
  variantId: number;
  productId: number;
  productTitle: string;
  /** The option's words ("Blue · M", or "Standard"). */
  option: string;
  left: number;
}

export interface RunningLow {
  /** Every option with 1 to LOW_STOCK_MAX left. */
  total: number;
  /** The fewest left first, at most RUNNING_LOW. */
  items: RunningLowItem[];
}

export interface RecentOrder {
  id: number;
  /** The buyer's short name ("Maria S."). */
  buyer: string;
  createdAt: string;
  /** The order's gross: this seller's lines, no shipping (orderGross). */
  amount: number;
  status: string;
}

export interface LatestReview {
  id: number;
  productId: number;
  productTitle: string;
  rating: number;
  /** The comment's first line, cut to about FIRST_LINE characters; null when there is none. */
  comment: string | null;
  reviewer: string;
  createdAt: string;
  /** Whether the seller has replied. */
  replied: boolean;
}

/** The widgets lib/seller-analytics.ts adds to its DTO; null: the rows behind it could not be read. */
export interface SellerWidgets {
  kpis: { sales: SellerKpi | null; orders: SellerKpi | null; itemsSold: SellerKpi | null };
  weekly: SellerWeek[] | null;
  status: SellerStatus | null;
  bestSellers: BestSeller[] | null;
  runningLow: RunningLow | null;
  recentOrders: RecentOrder[] | null;
  latestReviews: LatestReview[] | null;
}

/** The rows the widgets are built from; null: that read failed or needs a migration. */
export interface SellerRows {
  /** This seller's orders created in the WEEKS weeks, any status. */
  orders: readonly SellerOrderRow[] | null;
  /** The lines of those orders that count. */
  lines: readonly LineRow[] | null;
  /** This seller's newest orders of all time, at most RECENT_ORDERS. */
  recent: readonly SellerOrderRow[] | null;
  /** This seller's products. */
  products: readonly ProductLite[] | null;
  /** Their options. */
  variants: readonly VariantRow[] | null;
  /** Their visible reviews. */
  reviews: readonly ReviewRow[] | null;
  /** Buyer names by profile id, for the recent orders. */
  names: Readonly<Record<number, string>>;
  /** true when the orders or lines were clipped: no previous figures then. */
  partial: boolean;
}

export interface SellerTools {
  aggregate: AggregateModule;
  /** lib/format.ts statusLabel. */
  statusLabel: (status: string) => string;
  /** lib/pricing/core.ts variantLabel. */
  optionLabel: (colorName: string | null | undefined, size: string | null | undefined) => string;
  /** lib/format.ts shortName. */
  shortName: (name: string | null | undefined) => string;
}

function inside(at: string | null | undefined, range: Range): boolean {
  if (!at) return false;
  const t = Date.parse(at);
  return Number.isFinite(t) && t >= range.start && t < range.end;
}

/** A sum of pesos to the centavo, as aggregate.ts rounds its own. */
function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

function byText(a: string, b: string): number {
  return a.localeCompare(b, "en");
}

/** Newest first by a timestamp, then the higher id, so the order is stable. */
function newestFirst(a: { at: string; id: number }, b: { at: string; id: number }): number {
  const ta = Date.parse(a.at);
  const tb = Date.parse(b.at);
  const da = Number.isFinite(ta) ? ta : Number.NEGATIVE_INFINITY;
  const db = Number.isFinite(tb) ? tb : Number.NEGATIVE_INFINITY;
  return db - da || b.id - a.id;
}

/** "2026-11-04" → "11/4", as the admin overview labels its days. */
function shortDay(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return m && d ? `${m}/${d}` : key;
}

/** A week's label from its first and last Manila day: "11/4–11/10". */
export function weekLabel(firstDay: string, lastDay: string): string {
  return `${shortDay(firstDay)}–${shortDay(lastDay)}`;
}

/**
 * Units in the lines of the counted orders created in each bucket, in the
 * buckets' order (0 for a bucket with none). Lines of a pending, cancelled
 * or returned order, or of an order outside every bucket, add nothing.
 */
export function unitsByBucket(
  orders: readonly OrderRow[],
  lines: readonly LineRow[],
  buckets: readonly Range[],
  agg: AggregateModule
): number[] {
  const bucketOf = new Map<number, number>();
  for (const o of orders) {
    if (!agg.isCounted(o.order_status)) continue;
    const t = Date.parse(o.created_at);
    if (!Number.isFinite(t)) continue;
    const i = buckets.findIndex((b) => t >= b.start && t < b.end);
    if (i >= 0) bucketOf.set(o.id, i);
  }
  const out = buckets.map(() => 0);
  for (const l of lines) {
    const i = bucketOf.get(l.order_id);
    if (i !== undefined) out[i] += agg.num(l.quantity);
  }
  return out;
}

/**
 * Sales, orders and items sold for the last 30 days, each with the 30 days
 * before (null when `partial`: a clipped read loses the oldest orders first,
 * so a previous figure would fake a trend) and a daily series. Sales and
 * orders are aggregate.ts totals() and daily(), the admin's own rule; items
 * sold are the units in the lines of the same counted orders, null when the
 * lines could not be read.
 */
export function sellerKpis(
  orders: readonly OrderRow[],
  lines: readonly LineRow[] | null,
  spans: Pick<SellerSpans, "current" | "previous" | "days">,
  agg: AggregateModule,
  partial = false
): { sales: SellerKpi; orders: SellerKpi; itemsSold: SellerKpi | null } {
  const byOrder = lines ? agg.lineTotals(lines) : undefined;
  const cur = agg.totals(orders, spans.current, byOrder);
  const prev = partial ? null : agg.totals(orders, spans.previous, byOrder);
  const points = agg.daily(orders, spans.days, byOrder);
  return {
    sales: {
      key: "sales",
      label: "Sales (last 30 days)",
      value: cur.gross,
      previous: prev ? prev.gross : null,
      format: "money",
      goodWhen: "up",
      series: points.map((p) => p.revenue),
      href: "/seller/finance",
    },
    orders: {
      key: "orders",
      label: "Orders (last 30 days)",
      value: cur.orders,
      previous: prev ? prev.orders : null,
      format: "count",
      goodWhen: "up",
      series: points.map((p) => p.orders),
      href: "/seller/orders",
    },
    itemsSold: lines
      ? {
          key: "itemsSold",
          label: "Items sold (last 30 days)",
          value: unitsByBucket(orders, lines, [spans.current], agg)[0],
          previous: partial ? null : unitsByBucket(orders, lines, [spans.previous], agg)[0],
          format: "count",
          goodWhen: "up",
          series: unitsByBucket(orders, lines, spans.days, agg),
          href: "/seller/orders",
        }
      : null,
  };
}

/** Sales and counted orders per week block, oldest first; a week with nothing is 0. */
export function weeklySales(
  orders: readonly OrderRow[],
  weeks: readonly WeekBlock[],
  agg: AggregateModule,
  lines?: readonly LineRow[] | null
): SellerWeek[] {
  const byOrder = lines ? agg.lineTotals(lines) : undefined;
  return agg.series(orders, weeks, byOrder).map((p, i) => ({
    firstDay: weeks[i].firstDay,
    lastDay: weeks[i].lastDay,
    label: weekLabel(weeks[i].firstDay, weeks[i].lastDay),
    sales: p.revenue,
    orders: p.orders,
  }));
}

/** Every order created in the window by status (aggregate.ts statusSplit, zeros kept), with its words and the total. */
export function statusBreakdown(
  orders: readonly OrderRow[],
  current: Range,
  agg: AggregateModule,
  label: (status: string) => string
): SellerStatus {
  const byStatus = agg.statusSplit(orders, current).map((s) => ({ ...s, label: label(s.status) }));
  return { total: byStatus.reduce((n, s) => n + s.count, 0), byStatus };
}

/**
 * The best sellers by units over the counted orders created in the window,
 * each with its sales (unit_price × quantity). Ties go to the higher sales,
 * then the title, then the lower id. Only this seller's own products (those
 * in `products`) appear; a line whose product was deleted has nothing to
 * show and is left out. `image` is null here: the caller adds the photos of
 * the few products shown.
 */
export function bestSellers(
  orders: readonly OrderRow[],
  lines: readonly LineRow[],
  current: Range,
  products: readonly ProductLite[],
  agg: AggregateModule,
  limit = BEST_SELLERS
): BestSeller[] {
  const counted = new Set(
    orders.filter((o) => agg.isCounted(o.order_status) && inside(o.created_at, current)).map((o) => o.id)
  );
  const titleOf = new Map(products.map((p) => [p.id, p.title]));
  const by = new Map<number, BestSeller>();
  for (const l of lines) {
    if (!counted.has(l.order_id) || l.product_id === null || l.product_id === undefined) continue;
    const title = titleOf.get(l.product_id);
    if (title === undefined) continue;
    const p = by.get(l.product_id) ?? { id: l.product_id, title, image: null, units: 0, sales: 0 };
    p.units += agg.num(l.quantity);
    p.sales += agg.num(l.unit_price) * agg.num(l.quantity);
    by.set(l.product_id, p);
  }
  return [...by.values()]
    .filter((p) => p.units > 0)
    .map((p) => ({ ...p, sales: centavos(p.sales) }))
    .sort((a, b) => b.units - a.units || b.sales - a.sales || byText(a.title, b.title) || a.id - b.id)
    .slice(0, Math.max(0, limit));
}

/**
 * Options of this seller's products with 1 to LOW_STOCK_MAX left (0 is sold
 * out, 6 is fine), the fewest first, then by product and option: the first
 * `limit` and how many there are in all.
 */
export function runningLow(
  variants: readonly VariantRow[],
  products: readonly ProductLite[],
  optionLabel: SellerTools["optionLabel"],
  num: AggregateModule["num"],
  limit = RUNNING_LOW
): RunningLow {
  const titleOf = new Map(products.map((p) => [p.id, p.title]));
  const low: RunningLowItem[] = [];
  for (const v of variants) {
    const productTitle = titleOf.get(v.product_id);
    if (productTitle === undefined) continue;
    const left = num(v.stock_qty);
    if (left < 1 || left > LOW_STOCK_MAX) continue;
    low.push({ variantId: v.id, productId: v.product_id, productTitle, option: optionLabel(v.color_name, v.size), left });
  }
  low.sort(
    (a, b) =>
      a.left - b.left || byText(a.productTitle, b.productTitle) || byText(a.option, b.option) || a.variantId - b.variantId
  );
  return { total: low.length, items: low.slice(0, Math.max(0, limit)) };
}

/** The newest orders, any status: who (a short name), when, the order's gross (orderGross) and its status. */
export function recentOrders(
  orders: readonly SellerOrderRow[],
  names: Readonly<Record<number, string>>,
  shortName: SellerTools["shortName"],
  agg: AggregateModule,
  lines?: readonly LineRow[] | null,
  limit = RECENT_ORDERS
): RecentOrder[] {
  const byOrder = lines ? agg.lineTotals(lines) : undefined;
  return [...orders]
    .sort((a, b) => newestFirst({ at: a.created_at, id: a.id }, { at: b.created_at, id: b.id }))
    .slice(0, Math.max(0, limit))
    .map((o) => ({
      id: o.id,
      buyer: shortName(names[o.buyer_id]),
      createdAt: o.created_at,
      amount: agg.orderGross(o, byOrder),
      status: o.order_status,
    }));
}

/**
 * A review's first line, its spaces collapsed, cut to at most `max`
 * characters (the "…" included) at a word when one is near the end; null
 * when there is no text. Counted by code point, so an emoji is never split.
 */
export function firstLine(text: string | null | undefined, max = FIRST_LINE): string | null {
  const line = (String(text ?? "").trim().split(/\r?\n/)[0] ?? "").replace(/\s+/g, " ").trim();
  if (!line) return null;
  const chars = [...line];
  if (chars.length <= max) return line;
  let cut = chars.slice(0, Math.max(1, max - 1)).join("");
  const space = cut.lastIndexOf(" ");
  if (space >= cut.length * 0.6) cut = cut.slice(0, space);
  return `${cut.trimEnd()}…`;
}

/** The newest reviews of this seller's products, each with its product's title and whether the seller has replied. */
export function latestReviews(
  reviews: readonly ReviewRow[],
  products: readonly ProductLite[],
  limit = LATEST_REVIEWS
): LatestReview[] {
  const titleOf = new Map(products.map((p) => [p.id, p.title]));
  return reviews
    .filter((r) => titleOf.has(r.productId))
    .sort((a, b) => newestFirst({ at: a.createdAt, id: a.id }, { at: b.createdAt, id: b.id }))
    .slice(0, Math.max(0, limit))
    .map((r) => ({
      id: r.id,
      productId: r.productId,
      productTitle: titleOf.get(r.productId) ?? "",
      rating: r.rating,
      comment: firstLine(r.comment),
      reviewer: r.reviewer,
      createdAt: r.createdAt,
      replied: Boolean(r.sellerReply && r.sellerReply.trim()),
    }));
}

/**
 * Every widget from the rows. A widget whose rows are null is null (could
 * not be read), never an empty list (nothing yet): the order widgets need
 * the orders; items sold and best sellers also need the lines; best sellers,
 * running low and the latest reviews need the products, which scope them.
 */
export function sellerWidgets(rows: SellerRows, spans: SellerSpans, tools: SellerTools): SellerWidgets {
  const agg = tools.aggregate;
  const { orders, lines, products, variants, reviews, recent } = rows;
  const kpis = orders ? sellerKpis(orders, lines, spans, agg, rows.partial) : null;
  return {
    kpis: { sales: kpis?.sales ?? null, orders: kpis?.orders ?? null, itemsSold: kpis?.itemsSold ?? null },
    weekly: orders ? weeklySales(orders, spans.weeks, agg, lines) : null,
    status: orders ? statusBreakdown(orders, spans.current, agg, tools.statusLabel) : null,
    bestSellers: orders && lines && products ? bestSellers(orders, lines, spans.current, products, agg) : null,
    runningLow: variants && products ? runningLow(variants, products, tools.optionLabel, agg.num) : null,
    recentOrders: recent ? recentOrders(recent, rows.names, tools.shortName, agg, lines) : null,
    latestReviews: reviews && products ? latestReviews(reviews, products) : null,
  };
}

import type { DayRange, Range } from "./windows";

/**
 * The dashboards' figures from plain rows (03 §4, as the approved plan
 * corrected it): gross sales, orders, average order value, return rate, a
 * daily or weekly series, the status split, the top products and sales by
 * category. Plain numbers and arrays: no formatting, no names, no emails.
 *
 * Pure, with no runtime imports (`import type` is erased), so tests import
 * this file by its .ts path. Ranges come from lib/analytics/windows.ts and
 * are passed in: Node needs a file extension that tsc here does not allow.
 */

/** Orders that count as sales: confirmed, and not cancelled or returned (03 §4). */
export const COUNTED_STATUSES: readonly string[] = ["processing", "shipped", "delivered"];

/** Every order status, in the order the dashboards list them. */
export const ORDER_STATUSES: readonly string[] = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "return_requested",
  "returned",
];

/** The im_orders columns these figures read. */
export interface OrderRow {
  id: number;
  created_at: string;
  order_status: string;
  /**
   * Σ unit_price × quantity of the order's lines (migration 0015, which set
   * it on every older row and on every order checkout creates). numeric, so
   * it may arrive as a string.
   */
  subtotal: number | string | null;
  seller_id?: number | null;
  /** Set when an order goes shipped → delivered (migration 0014). */
  delivered_at?: string | null;
  /** Set when a return is asked for; kept when the seller declines it (0014). */
  return_requested_at?: string | null;
}

/** The im_order_items columns these figures read. */
export interface LineRow {
  order_id: number;
  /** null once the product is deleted. */
  product_id: number | null;
  quantity: number | string;
  unit_price: number | string;
}

export interface Totals {
  /** Σ subtotal of the counted orders created in the range. */
  gross: number;
  /** Counted orders created in the range. */
  orders: number;
  /** gross ÷ orders; null when there are none. */
  averageOrder: number | null;
  /** Orders with a return ÷ orders that reached delivery, from 0 to 1; null when none did. */
  returnRate: number | null;
}

export interface SeriesPoint {
  /** Gross sales of the counted orders created in the bucket. */
  revenue: number;
  /** Counted orders created in the bucket. */
  orders: number;
}

export interface ProductSales {
  productId: number;
  units: number;
  revenue: number;
}

/** A numeric column's value (PostgREST may send numeric as a string); 0 when it is not a finite number. */
export function num(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(n) ? n : 0;
}

/** A sum of pesos to the centavo, so float noise (0.1 + 0.2) never reaches a figure. */
function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

function within(at: string | null | undefined, range: Range): boolean {
  if (!at) return false;
  const t = Date.parse(at);
  return Number.isFinite(t) && t >= range.start && t < range.end;
}

export function isCounted(status: string): boolean {
  return COUNTED_STATUSES.includes(status);
}

/** Σ unit_price × quantity of each order's lines, by order id. */
export function lineTotals(lines: readonly LineRow[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const l of lines) out.set(l.order_id, (out.get(l.order_id) ?? 0) + num(l.unit_price) * num(l.quantity));
  return out;
}

/**
 * An order's gross sales: its subtotal. A null subtotal should not exist
 * (0015 backfilled every row, and orders are only created by its checkout
 * function, which sets it); if one does, the order's own lines stand in when
 * the caller passes their totals, which is what the subtotal would hold, and
 * otherwise it adds 0 rather than a guess.
 */
export function orderGross(order: OrderRow, lines?: ReadonlyMap<number, number>): number {
  const s = order.subtotal;
  if (s === null || s === undefined || (typeof s === "string" && s.trim() === "")) return lines?.get(order.id) ?? 0;
  return num(s);
}

/** Whether a return was asked for: a declined return goes back to delivered but keeps its timestamp. */
function hadReturn(o: OrderRow): boolean {
  return Boolean(o.return_requested_at) || o.order_status === "return_requested" || o.order_status === "returned";
}

/** Whether an order reached delivery, including older delivered orders with no delivered_at. */
function reachedDelivery(o: OrderRow): boolean {
  return hadReturn(o) || Boolean(o.delivered_at) || o.order_status === "delivered";
}

/** Gross sales, orders, average order value and return rate for orders created in `range`. */
export function totals(orders: readonly OrderRow[], range: Range, lines?: ReadonlyMap<number, number>): Totals {
  let gross = 0;
  let count = 0;
  let returns = 0;
  let delivered = 0;
  for (const o of orders) {
    if (!within(o.created_at, range)) continue;
    if (isCounted(o.order_status)) {
      gross += orderGross(o, lines);
      count++;
    }
    if (hadReturn(o)) returns++;
    if (reachedDelivery(o)) delivered++;
  }
  const g = centavos(gross);
  return {
    gross: g,
    orders: count,
    averageOrder: count ? centavos(g / count) : null,
    returnRate: delivered ? returns / delivered : null,
  };
}

/**
 * Gross sales and counted orders per bucket, in the buckets' order; a bucket
 * with nothing is 0, never missing. Buckets are days (dayRanges) or weeks
 * (weekBlocks) from lib/analytics/windows.ts.
 */
export function series(
  orders: readonly OrderRow[],
  buckets: readonly Range[],
  lines?: ReadonlyMap<number, number>
): SeriesPoint[] {
  const out = buckets.map(() => ({ revenue: 0, orders: 0 }));
  for (const o of orders) {
    if (!isCounted(o.order_status)) continue;
    const t = Date.parse(o.created_at);
    if (!Number.isFinite(t)) continue;
    const i = buckets.findIndex((b) => t >= b.start && t < b.end);
    if (i < 0) continue;
    out[i].revenue += orderGross(o, lines);
    out[i].orders++;
  }
  return out.map((p) => ({ revenue: centavos(p.revenue), orders: p.orders }));
}

/** The daily series: one point per Manila day, oldest first, each with its "YYYY-MM-DD". */
export function daily(
  orders: readonly OrderRow[],
  days: readonly DayRange[],
  lines?: ReadonlyMap<number, number>
): ({ day: string } & SeriesPoint)[] {
  return series(orders, days, lines).map((p, i) => ({ day: days[i].day, ...p }));
}

/**
 * Every order created in `range`, any status, counted by status: the seven
 * known ones in ORDER_STATUSES order with zeros kept, then any unknown status
 * under its own key, sorted.
 */
export function statusSplit(orders: readonly OrderRow[], range: Range): { status: string; count: number }[] {
  const known = new Map<string, number>(ORDER_STATUSES.map((s) => [s, 0]));
  const unknown = new Map<string, number>();
  for (const o of orders) {
    if (!within(o.created_at, range)) continue;
    const s = String(o.order_status);
    if (known.has(s)) known.set(s, (known.get(s) ?? 0) + 1);
    else unknown.set(s, (unknown.get(s) ?? 0) + 1);
  }
  const extra = [...unknown].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return [...known, ...extra].map(([status, count]) => ({ status, count }));
}

/** The ids of the counted orders created in `range`. */
function countedIds(orders: readonly OrderRow[], range: Range): Set<number> {
  return new Set(orders.filter((o) => isCounted(o.order_status) && within(o.created_at, range)).map((o) => o.id));
}

/**
 * The best sellers by units across the counted orders created in `range`,
 * each with its units and revenue (unit_price × quantity). Ties go to the
 * higher revenue, then the lower product id, so the order is stable. A line
 * whose product was deleted has no product to show and is left out.
 */
export function topProducts(
  orders: readonly OrderRow[],
  lines: readonly LineRow[],
  range: Range,
  limit = 5
): ProductSales[] {
  const counted = countedIds(orders, range);
  const by = new Map<number, ProductSales>();
  for (const l of lines) {
    if (!counted.has(l.order_id) || l.product_id === null || l.product_id === undefined) continue;
    const p = by.get(l.product_id) ?? { productId: l.product_id, units: 0, revenue: 0 };
    p.units += num(l.quantity);
    p.revenue += num(l.unit_price) * num(l.quantity);
    by.set(l.product_id, p);
  }
  return [...by.values()]
    .map((p) => ({ ...p, revenue: centavos(p.revenue) }))
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue || a.productId - b.productId)
    .slice(0, Math.max(0, limit));
}

/**
 * Gross sales by category from the lines of the counted orders created in
 * `range` (an order can span categories, so lines, not subtotals), highest
 * first, ties by label: the top `max` (8), then one `other` ("Other") with
 * the rest when more remain, so the bars always add up to the whole.
 * `categoryOf` maps a product id to its category's label; a line whose
 * product is gone or has no category counts under `unknown`. Categories with
 * no sales are left out.
 */
export function byCategory(
  orders: readonly OrderRow[],
  lines: readonly LineRow[],
  range: Range,
  categoryOf: ReadonlyMap<number, string>,
  opts: { max?: number; other?: string; unknown?: string } = {}
): { label: string; value: number }[] {
  const { max = 8, other = "Other", unknown = "Uncategorised" } = opts;
  const counted = countedIds(orders, range);
  const by = new Map<string, number>();
  for (const l of lines) {
    if (!counted.has(l.order_id)) continue;
    const label = (l.product_id !== null && l.product_id !== undefined && categoryOf.get(l.product_id)) || unknown;
    by.set(label, (by.get(label) ?? 0) + num(l.unit_price) * num(l.quantity));
  }
  const ranked = [...by]
    .map(([label, value]) => ({ label, value: centavos(value) }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  const keep = Math.max(0, Math.floor(max));
  if (ranked.length <= keep) return ranked;
  const rest = ranked.slice(keep).reduce((n, c) => n + c.value, 0);
  return [...ranked.slice(0, keep), { label: other, value: centavos(rest) }];
}

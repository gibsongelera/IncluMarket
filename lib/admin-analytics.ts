import "server-only";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DataUnavailableError, getDisplayNames } from "@/lib/data";
import { isMissingObject } from "@/lib/db-errors";
import { statusLabel } from "@/lib/format";
import { dayRanges, windows } from "@/lib/analytics/windows";
import {
  COUNTED_STATUSES,
  byCategory,
  daily,
  lineTotals,
  num,
  statusSplit,
  topProducts,
  totals,
  type LineRow,
  type OrderRow,
} from "@/lib/analytics/aggregate";

/**
 * Admin → Overview analytics (03 §4–§5, ADR-01): one read for the KPI row,
 * the sales chart, the order-status donut, the top products, sales by
 * category and the recent orders, all over the same 30 Manila days
 * (lib/analytics/windows.ts) and counted one way (lib/analytics/aggregate.ts),
 * so the figures agree with the seller dashboards.
 *
 * Bounded: orders are read for the two windows only (60 days), order lines
 * only for the counted orders of the current window, both page by page past
 * PostgREST's 1000-row cap and up to MAX_ROWS; products, photos and names
 * only for the rows the page shows or sums. The reads run in three parallel
 * waves. The result carries names and figures, never an email, a phone
 * number or an address.
 *
 * A read that needs a migration this database lacks gives its widget null
 * (the page shows "Needs a database update"); any other failure throws
 * DataUnavailableError for the page's error boundary, as lib/data.ts does,
 * so an outage never looks like a quiet month.
 *
 * Admin only, and it checks so itself: its first line is
 * requireRole(["admin"]) (memoised per request, so free on an admin page),
 * so a later "use server" wrapper or a page outside app/admin/ cannot turn
 * it into a feed of every sale and buyer name. scripts/check-page-props.mjs
 * also fails if a page outside app/admin/ imports it.
 */

/** Rows asked for per request. PostgREST may send fewer (its max-rows); paging follows what arrives. */
const PAGE = 1000;
/** The most rows read for one figure; past it the read stops, logs it and marks the result `partial`. */
const MAX_ROWS = 20_000;
/** Ids per `.in()` filter: about 2 KB of URL. */
const CHUNK = 200;
/** `.in()` chunks in flight at once. */
const PARALLEL = 4;
/** The most sequential page requests for one read, should PostgREST send far fewer rows than asked. */
const MAX_PAGES = 40;
/** Recent orders shown. */
const RECENT = 8;

type Db = ReturnType<typeof createAdminClient>;
type DbError = { code?: string; message: string };
type Res<T> = { data: T[] | null; error: DbError | null };
type Page<T> = Res<T> & { count?: number | null };

export interface AnalyticsKpi {
  key: "gross" | "orders" | "average" | "returns";
  label: string;
  /** The current window's figure. null: none to show (no orders to average, no deliveries) or `unavailable`. */
  value: number | null;
  /** The previous window's figure, for the trend; null as for `value`. */
  previous: number | null;
  /** true when the figure could not be read (a migration this database lacks). */
  unavailable: boolean;
  /** money: pesos; count: a whole number; percent: a fraction from 0 to 1. */
  format: "money" | "count" | "percent";
  goodWhen: "up" | "down";
  /** One value per Manila day, oldest first, for the sparkline; null on a day with nothing to average; empty when the figure has no daily form. */
  series: (number | null)[];
  href: string;
}

export interface AdminAnalytics {
  /**
   * true when the orders or lines passed MAX_ROWS and the oldest were left
   * out: the figures cover the newest rows only, so no trend is given (a
   * clipped previous window would fake one).
   */
  partial: boolean;
  kpis: AnalyticsKpi[];
  /** The current window by Manila day: "YYYY-MM-DD", gross sales, counted orders. */
  sales: { labels: string[]; revenue: number[]; orders: number[] } | null;
  /** Every order created in the window by status, zeros kept, with the words its pill shows. */
  status: { status: string; label: string; count: number }[] | null;
  topProducts:
    | {
        id: number;
        title: string;
        category: string;
        shop: string;
        image: string | null;
        units: number;
        revenue: number;
      }[]
    | null;
  byCategory: { label: string; value: number }[] | null;
  recentOrders:
    | {
        id: number;
        buyer: string;
        shop: string;
        amount: number;
        paymentStatus: string;
        orderStatus: string;
        createdAt: string;
      }[]
    | null;
}

interface RecentRow {
  id: number;
  buyer_id: number;
  seller_id: number | null;
  total_amount: number | string;
  payment_status: string | null;
  order_status: string;
  created_at: string;
}

interface ProductRow {
  id: number;
  title: string;
  category: string | null;
  seller_id: number;
}

function fail(what: string, error: DbError): never {
  console.error(`[admin-analytics] ${what}: ${error.message}`);
  throw new DataUnavailableError(what);
}

/** A list read: null when it needs a migration this database lacks; throws on any other error. */
function listOrNull<T>(what: string, res: Res<T>): T[] | null {
  if (!res.error) return res.data ?? [];
  if (isMissingObject(res.error)) return null;
  fail(what, res.error);
}

/**
 * Every row of a query, newest id first, page by page past PostgREST's
 * row cap. The first request also asks for the total; each next page starts
 * after the rows that actually arrived, so a max-rows below PAGE still pages
 * through everything. Stops at MAX_ROWS rows or MAX_PAGES requests, logged
 * and `partial` (the oldest rows are the ones left out). A row that moved
 * between pages while new orders arrived is kept once.
 */
async function readAll<T extends { id: number }>(
  what: string,
  page: (from: number, to: number, withCount: boolean) => PromiseLike<Page<T>>
): Promise<{ rows: T[]; partial: boolean } | null> {
  const byId = new Map<number, T>();
  let total = Number.POSITIVE_INFINITY;
  let from = 0;
  let pages = 0;
  let ended = false;
  while (from < Math.min(total, MAX_ROWS) && pages < MAX_PAGES) {
    const res = await page(from, Math.min(from + PAGE, MAX_ROWS) - 1, from === 0);
    pages++;
    const rows = listOrNull(what, res);
    if (rows === null) return null;
    if (from === 0 && typeof res.count === "number") total = res.count;
    for (const r of rows) byId.set(r.id, r);
    if (rows.length === 0) {
      ended = true;
      break;
    }
    from += rows.length;
  }
  const partial = !ended && from < total;
  if (partial) console.warn(`[admin-analytics] ${what}: stopped at ${MAX_ROWS} rows; the oldest are left out of the figures.`);
  return { rows: [...byId.values()], partial };
}

/** The rows for a list of ids, in chunks of CHUNK ids, PARALLEL chunks at a time. */
async function readIn<T>(
  what: string,
  ids: readonly number[],
  query: (chunk: number[]) => PromiseLike<Res<T>>
): Promise<T[] | null> {
  const unique = [...new Set(ids)];
  const chunks: number[][] = [];
  for (let i = 0; i < unique.length; i += CHUNK) chunks.push(unique.slice(i, i + CHUNK));
  const out: T[] = [];
  for (let i = 0; i < chunks.length; i += PARALLEL) {
    for (const res of await Promise.all(chunks.slice(i, i + PARALLEL).map(query))) {
      const rows = listOrNull(what, res);
      if (rows === null) return null;
      out.push(...rows);
    }
  }
  return out;
}

const isId = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;

/** Each seller's shop name, or their own name before they set one (or on a database without 0019). */
async function shopNames(db: Db, ids: readonly number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter(isId))];
  if (!unique.length) return new Map();
  let res: Res<{ id: number; name: string | null; shop_name?: string | null }> = await db
    .from("im_profiles")
    .select("id, name, shop_name")
    .in("id", unique);
  if (res.error && isMissingObject(res.error)) res = await db.from("im_profiles").select("id, name").in("id", unique);
  if (res.error) fail("shop names", res.error);
  return new Map((res.data ?? []).map((p) => [p.id, p.shop_name?.trim() || p.name?.trim() || ""]));
}

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  await requireRole(["admin"]);
  const db = createAdminClient();
  const { current, previous } = windows(Date.now());
  const days = dayRanges(current);
  const iso = (ms: number) => new Date(ms).toISOString();
  const counted = (withCount: boolean) => (withCount ? ({ count: "exact" } as const) : undefined);

  // Wave 1: the two windows' orders, the current window's counted lines,
  // the category names and the newest orders.
  const [orderRead, lineRead, categories, recent] = await Promise.all([
    readAll<OrderRow>("orders", (from, to, withCount) =>
      db
        .from("im_orders")
        .select("id, created_at, order_status, subtotal, seller_id, delivered_at, return_requested_at", counted(withCount))
        .gte("created_at", iso(previous.start))
        .lt("created_at", iso(current.end))
        .order("id", { ascending: false })
        .range(from, to)
    ),
    // The lines of counted orders created in the window: the order is
    // filtered through the join (!inner), so no list of order ids is sent
    // (ADR-01 planned id chunks; the join reads the same rows in one paged
    // query).
    readAll<LineRow & { id: number }>("order lines", (from, to, withCount) =>
      db
        .from("im_order_items")
        .select(
          "id, order_id, product_id, quantity, unit_price, im_orders!inner(id, created_at, order_status)",
          counted(withCount)
        )
        .gte("im_orders.created_at", iso(current.start))
        .lt("im_orders.created_at", iso(current.end))
        .in("im_orders.order_status", [...COUNTED_STATUSES])
        .order("id", { ascending: false })
        .range(from, to)
    ),
    db
      .from("im_categories")
      .select("id, label")
      .then((res) => listOrNull<{ id: string; label: string }>("categories", res)),
    db
      .from("im_orders")
      .select("id, buyer_id, seller_id, total_amount, payment_status, order_status, created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(RECENT)
      .then((res) => listOrNull<RecentRow>("recent orders", res)),
  ]);

  const orderRows = orderRead?.rows ?? null;
  const lines: LineRow[] | null =
    lineRead?.rows.map((l) => ({
      order_id: l.order_id,
      product_id: l.product_id,
      quantity: l.quantity,
      unit_price: l.unit_price,
    })) ?? null;
  const partial = Boolean(orderRead?.partial || lineRead?.partial);
  const byOrder = lines ? lineTotals(lines) : undefined;
  const cur = orderRows && totals(orderRows, current, byOrder);
  // A clipped read loses the oldest orders first, the previous window's: no trend then.
  const prev = orderRows && !partial ? totals(orderRows, previous, byOrder) : null;
  const points = orderRows && daily(orderRows, days, byOrder);
  const top = orderRows && lines ? topProducts(orderRows, lines, current) : null;

  // Wave 2: the products the lines name, for their categories, titles and shops.
  const productIds = (lines ?? []).map((l) => l.product_id).filter(isId);
  const products = productIds.length
    ? await readIn<ProductRow>("products", productIds, (chunk) =>
        db.from("im_products").select("id, title, category, seller_id").in("id", chunk)
      )
    : [];
  const productById = new Map((products ?? []).map((p) => [p.id, p]));

  // Wave 3: the first photo of each top product, shop names and buyer names,
  // only for the rows the page shows.
  const topIds = (top ?? []).map((t) => t.productId);
  const [photos, shops, buyers] = await Promise.all([
    topIds.length
      ? readIn<{ product_id: number; url: string }>("product photos", topIds, (chunk) =>
          db.from("im_product_images").select("product_id, url").in("product_id", chunk).eq("position", 0)
        )
      : [],
    shopNames(db, [
      ...(recent ?? []).map((o) => o.seller_id).filter(isId),
      ...topIds.map((id) => productById.get(id)?.seller_id).filter(isId),
    ]),
    recent?.length ? getDisplayNames(recent.map((o) => o.buyer_id)) : Promise.resolve({} as Record<number, string>),
  ]);
  const photoById = new Map((photos ?? []).map((p) => [p.product_id, p.url]));

  const categoryLabel = new Map((categories ?? []).map((c) => [c.id, c.label]));
  const labelOf = (p: ProductRow | undefined) => (p?.category ? categoryLabel.get(p.category) : undefined);
  const categoryOf = new Map<number, string>();
  for (const p of products ?? []) {
    const label = labelOf(p);
    if (label) categoryOf.set(p.id, label);
  }

  const unavailable = orderRows === null;
  const kpi = (k: Omit<AnalyticsKpi, "unavailable">): AnalyticsKpi => ({ ...k, unavailable });

  return {
    partial,
    kpis: [
      kpi({
        key: "gross",
        label: "Gross sales (last 30 days)",
        value: cur?.gross ?? null,
        previous: prev?.gross ?? null,
        format: "money",
        goodWhen: "up",
        series: points?.map((p) => p.revenue) ?? [],
        href: "/admin/orders",
      }),
      kpi({
        key: "orders",
        label: "Orders (last 30 days)",
        value: cur?.orders ?? null,
        previous: prev?.orders ?? null,
        format: "count",
        goodWhen: "up",
        series: points?.map((p) => p.orders) ?? [],
        href: "/admin/orders",
      }),
      kpi({
        key: "average",
        label: "Average order value",
        value: cur?.averageOrder ?? null,
        previous: prev?.averageOrder ?? null,
        format: "money",
        goodWhen: "up",
        series: points?.map((p) => (p.orders ? Math.round((p.revenue / p.orders) * 100) / 100 : null)) ?? [],
        href: "/admin/orders",
      }),
      kpi({
        key: "returns",
        label: "Return rate (last 30 days)",
        value: cur?.returnRate ?? null,
        previous: prev?.returnRate ?? null,
        format: "percent",
        goodWhen: "down",
        // A daily return rate is mostly empty days at this shop's volume.
        series: [],
        href: "/admin/orders?view=returns",
      }),
    ],
    sales: points
      ? { labels: points.map((p) => p.day), revenue: points.map((p) => p.revenue), orders: points.map((p) => p.orders) }
      : null,
    status: orderRows ? statusSplit(orderRows, current).map((s) => ({ ...s, label: statusLabel(s.status) })) : null,
    topProducts:
      top && products
        ? top.map((t) => {
            const p = productById.get(t.productId);
            return {
              id: t.productId,
              title: p?.title ?? `Product ${t.productId}`,
              category: labelOf(p) ?? "Uncategorised",
              shop: (p && shops.get(p.seller_id)) || "",
              image: photoById.get(t.productId) ?? null,
              units: t.units,
              revenue: t.revenue,
            };
          })
        : null,
    byCategory: orderRows && lines && products && categories ? byCategory(orderRows, lines, current, categoryOf) : null,
    recentOrders: recent
      ? recent.map((o) => ({
          id: o.id,
          buyer: buyers[o.buyer_id] ?? "",
          shop: (isId(o.seller_id) && shops.get(o.seller_id)) || "",
          amount: num(o.total_amount),
          paymentStatus: o.payment_status ?? "",
          orderStatus: o.order_status,
          createdAt: o.created_at,
        }))
      : null,
  };
}

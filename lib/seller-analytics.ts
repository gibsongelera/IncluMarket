import "server-only";
import { cache } from "react";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getDisplayNames,
  getOrderItemsForOrders,
  getSellerProductIndex,
  getSellerSetup,
  getVariantsForProducts,
} from "@/lib/data";
import { getSellerFinance } from "@/lib/finance";
import { getReviewsLite, type ReviewLite } from "@/lib/reviews";
import { getMyVerification, type MyVerificationLite } from "@/lib/pwd/data";
import { getMyUnreadMessageCount } from "@/lib/actions/messages";
import { isMissingObject } from "@/lib/db-errors";
import { shortName, statusLabel } from "@/lib/format";
import { variantLabel } from "@/lib/pricing/core";
import * as aggregate from "@/lib/analytics/aggregate";
import { dayRanges, weekBlocks, windows } from "@/lib/analytics/windows";
import {
  LOW_STOCK_MAX,
  RECENT_ORDERS,
  WEEKS,
  sellerWidgets,
  type BestSeller,
  type LatestReview,
  type RecentOrder,
  type RunningLow,
  type SellerKpi,
  type SellerOrderRow,
  type SellerStatus,
  type SellerTools,
  type SellerWeek,
} from "@/lib/analytics/seller";
import type { LineRow } from "@/lib/analytics/aggregate";

export type {
  BestSeller,
  LatestReview,
  RecentOrder,
  RunningLow,
  RunningLowItem,
  SellerKpi,
  SellerStatus,
  SellerWeek,
} from "@/lib/analytics/seller";

/**
 * Seller Centre → Dashboard (04 §3–§4): the KPI row, sales by week, orders
 * by status, best sellers, running low, recent orders, the latest reviews,
 * the setup checklist and the to-do counts, as one DTO. The maths is in
 * lib/analytics/seller.ts (pure, tested), over lib/analytics/aggregate.ts's
 * counting rule and lib/analytics/windows.ts's Manila days, so a seller's
 * "Sales (last 30 days)" is the admin's gross sales for that seller's orders.
 *
 * Scoped to one seller, and only the session's: getSellerDashboard() and
 * getSellerTodo() take no id. Their first line is requireRole(["seller"])
 * (memoised per request, so free on a seller page), and every read is
 * filtered by that session's user_id, or by ids that came from a read so
 * filtered: orders by im_orders.seller_id; their lines by those orders' ids;
 * products by im_products.seller_id; options, reviews and photos by those
 * products' ids; buyer names by the buyers of those orders; money by
 * getSellerFinance(user_id). The DTO carries names and figures, never an
 * email, a phone number or an address.
 *
 * Bounded: orders for WEEKS weeks only (84 Manila days, which cover the
 * 30-day window and the 30 before it), page by page past PostgREST's
 * 1000-row cap up to MAX_ROWS; lines only for the counted ones, in chunks;
 * photos and names only for the rows shown. Clipped reads set `partial`.
 *
 * Every widget fails on its own: a read that fails logs and gives its
 * widgets null ("could not be read"), which is not an empty list ("nothing
 * yet"). A read that needs a migration this database lacks also gives null,
 * and `degraded` names the migration, for the page to say so. Nothing here
 * throws for a failed read: the page renders whatever could be read.
 */

/** Rows asked for per request. PostgREST may send fewer (its max-rows); paging follows what arrives. */
const PAGE = 1000;
/** Supabase's default max-rows: a chunked read that returns this many may have been cut short. */
const ROW_CAP = 1000;
/** The most orders read; past it the read stops, logs it and marks the result `partial`. */
const MAX_ROWS = 20_000;
/** The most sequential page requests for one read, should PostgREST send far fewer rows than asked. */
const MAX_PAGES = 40;
/** Ids per `.in()` filter: about 2 KB of URL. */
const CHUNK = 200;
/** Order ids per lines read: 100 orders would need over ten lines each to reach ROW_CAP. */
const LINE_CHUNK = 100;
/** Product ids per options read, for the same reason. */
const VARIANT_CHUNK = 100;
/** `.in()` chunks in flight at once. */
const PARALLEL = 4;

/** Migrations a widget can be waiting for. */
const NEEDS_SELLER_ID = "0015";
const NEEDS_PAYOUTS = "0020";

type DbError = { code?: string; message: string };
type Res<T> = { data: T[] | null; error: DbError | null; count?: number | null };
type HeadRes = { count: number | null; error: DbError | null };

/** A read that needs a migration this database lacks. */
const MISSING = "missing" as const;
type Missing = typeof MISSING;

/** Every widget of the DTO, for `degraded`. */
export type SellerWidget =
  | "sales"
  | "orders"
  | "itemsSold"
  | "readyToWithdraw"
  | "weekly"
  | "status"
  | "bestSellers"
  | "runningLow"
  | "recentOrders"
  | "latestReviews";

/** The widgets built from this seller's orders: all need im_orders.seller_id (migration 0015). */
const ORDER_WIDGETS: readonly SellerWidget[] = ["sales", "orders", "itemsSold", "weekly", "status", "bestSellers"];

export interface ReadyToWithdraw {
  label: string;
  /** Pesos the seller can ask to be paid out now (balance.available). */
  available: number;
  /** Pesos still on the way (balance.pending): delivered online sales inside the return window, and the like. */
  pending: number;
  href: string;
}

export interface SetupStep {
  label: string;
  done: boolean;
  href: string;
}

export interface SellerTodoItem {
  key: "pending" | "processing" | "returns" | "lowStock" | "flagged" | "reviews" | "messages";
  /** Today's words, shown after the count ("3 orders to ship"). */
  label: string;
  /** null: it could not be read (a failed read or a missing migration), never shown as 0. */
  count: number | null;
  href: string;
}

export interface SellerDashboard {
  /** true when the orders or their lines passed a row cap and the oldest were left out: no previous figures then. */
  partial: boolean;
  /** Each widget that is null because this database lacks a migration, with that migration's number ("0015"). */
  degraded: Partial<Record<SellerWidget, string>>;
  kpis: {
    sales: SellerKpi | null;
    orders: SellerKpi | null;
    itemsSold: SellerKpi | null;
    readyToWithdraw: ReadyToWithdraw | null;
  };
  /** WEEKS Manila weeks, oldest first. */
  weekly: SellerWeek[] | null;
  /** Orders created in the last 30 days by status, for the donut. */
  status: SellerStatus | null;
  bestSellers: BestSeller[] | null;
  runningLow: RunningLow | null;
  recentOrders: RecentOrder[] | null;
  latestReviews: LatestReview[] | null;
  /** The getting-started checklist; null when the products or the shop could not be read. */
  setup: SetupStep[] | null;
  /** The to-do counts, as getSellerTodo() gives them. */
  todo: SellerTodoItem[];
  /**
   * The seller's PWD verification, for the page's banner: the read the
   * setup checklist's first step already makes, so the page does not make
   * it twice. null when it could not be read (no banner then, as before).
   */
  verification: MyVerificationLite | null;
}

const TOOLS: SellerTools = { aggregate, statusLabel, optionLabel: variantLabel, shortName };

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

function logFail(what: string, e: unknown): void {
  console.error(`[seller-analytics] ${what}: ${messageOf(e)}`);
}

/** A read that may throw (the lib/data.ts readers throw DataUnavailableError): its value, or null, logged. */
async function attempt<T>(what: string, run: () => PromiseLike<T>): Promise<T | null> {
  try {
    return await run();
  } catch (e) {
    logFail(what, e);
    return null;
  }
}

function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * A reader over a list of ids, CHUNK-sized chunks at a time, PARALLEL in
 * flight. Throws as the reader does; `clipped` is true when a chunk came
 * back with ROW_CAP rows and so may have been cut short.
 */
async function inChunks<T>(
  ids: readonly number[],
  size: number,
  read: (chunk: number[]) => Promise<T[]>
): Promise<{ rows: T[]; clipped: boolean }> {
  const parts = chunks([...new Set(ids)], size);
  const rows: T[] = [];
  let clipped = false;
  for (let i = 0; i < parts.length; i += PARALLEL) {
    for (const got of await Promise.all(parts.slice(i, i + PARALLEL).map(read))) {
      if (got.length >= ROW_CAP) clipped = true;
      rows.push(...got);
    }
  }
  return { rows, clipped };
}

/**
 * Every row of a query, newest id first, page by page past PostgREST's row
 * cap (the lib/admin-analytics.ts pattern): the first request asks for the
 * total; each next page starts after the rows that actually arrived. Stops
 * at MAX_ROWS rows or MAX_PAGES requests, logged and `partial` (the oldest
 * rows are the ones left out). MISSING when it needs a migration this
 * database lacks; null, logged, on any other error.
 */
async function readAll<T extends { id: number }>(
  what: string,
  page: (from: number, to: number, withCount: boolean) => PromiseLike<Res<T>>
): Promise<{ rows: T[]; partial: boolean } | Missing | null> {
  const byId = new Map<number, T>();
  let total = Number.POSITIVE_INFINITY;
  let from = 0;
  let pages = 0;
  let ended = false;
  try {
    while (from < Math.min(total, MAX_ROWS) && pages < MAX_PAGES) {
      const res = await page(from, Math.min(from + PAGE, MAX_ROWS) - 1, from === 0);
      pages++;
      if (res.error) {
        if (isMissingObject(res.error)) return MISSING;
        logFail(what, res.error);
        return null;
      }
      const rows = res.data ?? [];
      if (from === 0 && typeof res.count === "number") total = res.count;
      for (const r of rows) byId.set(r.id, r);
      if (rows.length === 0) {
        ended = true;
        break;
      }
      from += rows.length;
    }
  } catch (e) {
    logFail(what, e);
    return null;
  }
  const partial = !ended && from < total;
  if (partial) console.warn(`[seller-analytics] ${what}: stopped at ${from} rows; the oldest are left out of the figures.`);
  return { rows: [...byId.values()], partial };
}

/** A HEAD count: the number, or null (logged) when it cannot be read. Never 0 for a failure. */
async function headCount(what: string, query: PromiseLike<HeadRes>): Promise<number | null> {
  try {
    const { count, error } = await query;
    if (error) {
      // A missing column or table (an unapplied migration) is expected on an older database: no log.
      if (!isMissingObject(error)) logFail(what, error);
      return null;
    }
    return count ?? 0;
  } catch (e) {
    logFail(what, e);
    return null;
  }
}

/** A HEAD count over a list of ids, chunk by chunk, summed; null if any chunk fails. */
async function headCountIn(
  what: string,
  ids: readonly number[],
  query: (chunk: number[]) => PromiseLike<HeadRes>
): Promise<number | null> {
  let sum = 0;
  for (const chunk of chunks([...new Set(ids)], CHUNK)) {
    const n = await headCount(what, query(chunk));
    if (n === null) return null;
    sum += n;
  }
  return sum;
}

/**
 * This seller's products (id, title, status), read once per request: the
 * dashboard and the to-do counts (and the sidebar's badges after P3-04)
 * share it.
 */
const productIndex = cache((sellerId: number) => getSellerProductIndex(sellerId));

const HEAD = { count: "exact", head: true } as const;

/**
 * The dashboard's to-do counts, in today's order and words, each linking to
 * the filtered list (C-31). Memoised for one server render (React cache), so
 * the dashboard and, after P3-04, the sidebar's badges cost one set of
 * counts between them. Scoped to the session's seller; takes no id.
 *
 * The order counts are HEAD counts on im_orders by seller_id and status over
 * all time: the dashboard's 84-day read would miss an old pending order.
 * Each count that cannot be read is null, not 0, except unread messages:
 * getMyUnreadMessageCount (lib/actions/messages.ts, as the page uses it
 * today) answers 0 for a read it could not make, and only a throw is null.
 */
export const getSellerTodo = cache(async (): Promise<SellerTodoItem[]> => {
  const session = await requireRole(["seller"]);
  const me = session.user_id;
  const db = createAdminClient();
  const orders = (status: string) =>
    headCount(`${status} orders`, db.from("im_orders").select("id", HEAD).eq("seller_id", me).eq("order_status", status));

  const products = await attempt("products", () => productIndex(me));
  const ids = products?.map((p) => p.id) ?? null;

  const [pending, processing, returns, lowStock, reviews, messages] = await Promise.all([
    orders("pending"),
    orders("processing"),
    orders("return_requested"),
    ids === null
      ? null
      : headCountIn("options running low", ids, (chunk) =>
          db.from("im_product_variants").select("id", HEAD).in("product_id", chunk).gte("stock_qty", 1).lte("stock_qty", LOW_STOCK_MAX)
        ),
    ids === null
      ? null
      : headCountIn("reviews to reply to", ids, (chunk) =>
          db
            .from("im_product_reviews")
            .select("id", HEAD)
            .in("product_id", chunk)
            .eq("status", "visible")
            .is("seller_reply", null)
        ),
    attempt("unread messages", () => getMyUnreadMessageCount()),
  ]);

  return [
    { key: "pending", label: "new orders to confirm", count: pending, href: "/seller/orders?status=pending" },
    { key: "processing", label: "orders to ship", count: processing, href: "/seller/orders?status=processing" },
    {
      key: "returns",
      label: "return requests to answer",
      count: returns,
      href: "/seller/orders?status=return_requested",
    },
    { key: "lowStock", label: "options low on stock", count: lowStock, href: "/seller/products" },
    {
      key: "flagged",
      label: "listings needing changes",
      count: products ? products.filter((p) => p.status === "flagged").length : null,
      href: "/seller/products",
    },
    { key: "reviews", label: "reviews waiting for your reply", count: reviews, href: "/seller/reviews" },
    { key: "messages", label: "unread messages", count: messages, href: "/seller/messages" },
  ];
});

/**
 * The seller dashboard's DTO. Takes NO id, which is stricter than the plan
 * row's getSellerDashboard(sellerId): 04 §4 says the seller id comes from the
 * session (requireRole(["seller"])), never from a parameter the browser
 * controls, so no caller, a later "use server" wrapper included, can point
 * it at another seller's shop.
 */
export async function getSellerDashboard(): Promise<SellerDashboard> {
  const session = await requireRole(["seller"]);
  const me = session.user_id;
  const db = createAdminClient();
  const now = Date.now();
  const { current, previous } = windows(now);
  const spans = { current, previous, days: dayRanges(current), weeks: weekBlocks(now, WEEKS) };
  const since = spans.weeks[0]?.start ?? previous.start;
  const iso = (ms: number) => new Date(ms).toISOString();
  const columns = "id, buyer_id, created_at, order_status, subtotal";

  // Wave 1: this seller's orders of the last 12 weeks, their newest orders
  // of all time, their products, their money, the setup checklist's reads
  // and the to-do counts.
  const [orderRead, recentRead, products, finance, shop, verification, todo] = await Promise.all([
    readAll<SellerOrderRow>("orders", (from, to, withCount) =>
      db
        .from("im_orders")
        .select(columns, withCount ? { count: "exact" } : undefined)
        .eq("seller_id", me)
        .gte("created_at", iso(since))
        .lt("created_at", iso(current.end))
        .order("id", { ascending: false })
        .range(from, to)
    ),
    (async (): Promise<SellerOrderRow[] | Missing | null> => {
      try {
        const res = await db
          .from("im_orders")
          .select(columns)
          .eq("seller_id", me)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(RECENT_ORDERS);
        if (!res.error) return (res.data ?? []) as SellerOrderRow[];
        if (isMissingObject(res.error)) return MISSING;
        logFail("recent orders", res.error);
        return null;
      } catch (e) {
        logFail("recent orders", e);
        return null;
      }
    })(),
    attempt("products", () => productIndex(me)),
    attempt("money", () => getSellerFinance(me)),
    attempt("shop setup", () => getSellerSetup(me)),
    attempt("PWD verification", () => getMyVerification(me)),
    getSellerTodo(),
  ]);

  const orders = orderRead && orderRead !== MISSING ? orderRead.rows : null;
  const recent = recentRead && recentRead !== MISSING ? recentRead : null;
  const productIds = products?.map((p) => p.id) ?? [];
  // Lines only for the orders that count: no other figure reads them.
  const countedIds = (orders ?? []).filter((o) => aggregate.isCounted(o.order_status)).map((o) => o.id);

  // Wave 2: the lines of those orders, this seller's options and reviews,
  // and the names of the recent orders' buyers.
  const [lineRead, variantRead, reviewRead, names] = await Promise.all([
    orders
      ? attempt("order lines", () => inChunks(countedIds, LINE_CHUNK, (chunk) => getOrderItemsForOrders(chunk)))
      : null,
    products
      ? attempt("options", () => inChunks(productIds, VARIANT_CHUNK, (chunk) => getVariantsForProducts(chunk)))
      : null,
    products
      ? attempt("reviews", () => inChunks<ReviewLite>(productIds, CHUNK, (chunk) => getReviewsLite(chunk)))
      : null,
    recent?.length
      ? attempt("buyer names", () => getDisplayNames(recent.map((o) => o.buyer_id)))
      : ({} as Record<number, string>),
  ]);

  // A line counts only for this seller's own product (a backstop: since
  // 0015 an order holds one seller's lines, and checkout checks it); a line
  // whose product was deleted (product_id null) stays, as its order is ours.
  const mine = products ? new Set(productIds) : null;
  // Clipped lines or options would undercount items sold, best sellers and
  // Running low while looking exact: those widgets say "could not load"
  // instead (P3-01 security review).
  const lines: LineRow[] | null =
    lineRead && !lineRead.clipped
      ? lineRead.rows
          .filter((l) => !mine || l.product_id == null || mine.has(l.product_id))
          .map((l) => ({
            order_id: l.order_id,
            product_id: l.product_id,
            quantity: l.quantity,
            unit_price: l.unit_price,
          }))
      : null;
  if (lineRead?.clipped) console.warn("[seller-analytics] order lines: a chunk reached the row cap; items sold and best sellers are left out.");
  if (variantRead?.clipped) console.warn("[seller-analytics] options: a chunk reached the row cap; Running low is left out.");
  const partial = Boolean((orderRead && orderRead !== MISSING && orderRead.partial) || lineRead?.clipped);

  const widgets = sellerWidgets(
    {
      orders,
      lines,
      recent,
      products,
      variants: variantRead && !variantRead.clipped ? variantRead.rows : null,
      reviews: reviewRead?.rows ?? null,
      names: names ?? {},
      partial,
    },
    spans,
    TOOLS
  );

  // Wave 3: the first photo of each best seller shown (their ids are this
  // seller's: bestSellers keeps only products from the index). A photo that
  // cannot be read leaves the thumbnail empty, not the table.
  const topIds = (widgets.bestSellers ?? []).map((b) => b.id);
  const photoById = new Map<number, string>();
  if (topIds.length) {
    try {
      const res = await db.from("im_product_images").select("product_id, url").in("product_id", topIds).eq("position", 0);
      if (res.error) logFail("product photos", res.error);
      for (const p of (res.data ?? []) as { product_id: number; url: string }[]) photoById.set(p.product_id, p.url);
    } catch (e) {
      logFail("product photos", e);
    }
  }

  const degraded: Partial<Record<SellerWidget, string>> = {};
  if (orderRead === MISSING) for (const w of ORDER_WIDGETS) degraded[w] = NEEDS_SELLER_ID;
  if (recentRead === MISSING) degraded.recentOrders = NEEDS_SELLER_ID;
  if (finance && !finance.available) degraded.readyToWithdraw = NEEDS_PAYOUTS;

  // The checklist as the page computes it today. A verification that could
  // not be read leaves its step not done, as the page's .catch(() => null) does.
  const setup: SetupStep[] | null =
    products && shop
      ? [
          { label: "Verify your PWD ID", done: verification?.state === "verified", href: "/account/verification" },
          { label: "Tell buyers your story", done: shop.story, href: "/seller/shop" },
          { label: "Name your shop", done: shop.shopName, href: "/seller/shop" },
          { label: "Add your first product", done: products.length > 0, href: "/seller/products" },
          { label: "Get a product approved", done: products.some((p) => p.status === "approved"), href: "/seller/products" },
        ]
      : null;

  return {
    partial,
    degraded,
    kpis: {
      ...widgets.kpis,
      readyToWithdraw:
        finance && finance.available
          ? {
              label: "Ready to withdraw",
              available: finance.balance.available,
              pending: finance.balance.pending,
              href: "/seller/finance",
            }
          : null,
    },
    weekly: widgets.weekly,
    status: widgets.status,
    bestSellers: widgets.bestSellers?.map((b) => ({ ...b, image: photoById.get(b.id) ?? null })) ?? null,
    runningLow: widgets.runningLow,
    recentOrders: widgets.recentOrders,
    latestReviews: widgets.latestReviews,
    setup,
    todo,
    verification,
  };
}

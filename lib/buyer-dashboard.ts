import "server-only";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProductThumbs } from "@/lib/data";
import { getWishlistView } from "@/lib/storefront";
import { getHomeRecommendations, type Recommendation } from "@/lib/recommend";
import { getMyVerification, type MyVerificationLite } from "@/lib/pwd/data";
import { expireStalePayments } from "@/lib/payments/stock";
import { isMissingObject } from "@/lib/db-errors";
import { svgPlaceholder } from "@/lib/format";
import { buyerStatusText, countBuyerTabs, type PurchaseCounts } from "@/lib/orders/state";
import type { StorefrontItem } from "@/lib/storefront-core";

/**
 * The buyer dashboard (/account for a buyer, 05 §3, P4-06) as one DTO:
 * the "My purchases" counts, the three newest orders, PWD verification,
 * four saved items and "Picked for you".
 *
 * Scoped to one buyer, the session's own: the page passes session.user_id,
 * and the first line checks that it is the signed-in buyer's id, so no id
 * from a URL or a prop can reach a read. Every read is filtered by that id,
 * or by ids that came from a read so filtered: orders by im_orders.buyer_id;
 * their lines by those orders' ids; products by those lines' product ids;
 * shop names by those orders' sellers; the wishlist by im_wishlists.user_id;
 * verification by profile_id. The DTO carries titles, shop names, statuses
 * and figures, never an email, a phone number or an address (the orders
 * read leaves the shipping_* columns out).
 *
 * The counts agree with /buyer/orders: the same sweep first
 * (expireStalePayments, throttled), then the same query, im_orders for this
 * buyer_id, newest first, with no range, so PostgREST's max-rows cap (1,000
 * on Supabase) clips both pages to the same newest orders, counted by the
 * same rule (buyerTab, through countBuyerTabs).
 *
 * Every widget reads on its own, in one Promise.all, and fails on its own:
 * a read that fails logs and gives that widget null ("could not be read"),
 * which is never an empty list ("nothing yet"). Nothing here throws for a
 * failed read; the page renders whatever could be read.
 */

/** One of the three newest orders, as the Recent orders list shows it. */
export interface RecentOrderLite {
  id: number;
  createdAt: string;
  status: string;
  /** buyerStatusText(): "Waiting for payment", "On the way", … */
  statusText: string;
  /** im_orders.total_amount, the total /buyer/orders shows. */
  total: number;
  /** The first line's product title; "Item" when the product is gone. */
  title: string;
  /** Its first photo (a storage URL or an older data URL), else the placeholder tile. */
  thumb: string;
  /** The seller's shop name, else their public name; null when unknown. */
  shop: string | null;
  /** Units ordered, every line. */
  itemCount: number;
}

export interface BuyerWishlist {
  /** The newest four saved listings still for sale. */
  items: StorefrontItem[];
  /** Everything saved, as /buyer/wishlist lists it: for sale, and no longer for sale. */
  total: number;
  /** Every saved listing still for sale, for the hearts on "Picked for you". */
  savedIds: number[];
}

export interface BuyerDashboard {
  counts: PurchaseCounts | null;
  recent: RecentOrderLite[] | null;
  verification: MyVerificationLite | null;
  wishlist: BuyerWishlist | null;
  rec: Recommendation | null;
}

const RECENT = 3;
const WISHLIST_SHOWN = 4;

type DbError = { code?: string; message: string };

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

/**
 * A widget's read: its value, or null, logged. It catches everything,
 * Next's redirect() and notFound() included, so an auth check belongs in
 * getBuyerDashboard before the widgets, never inside one.
 */
async function attempt<T>(what: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (e) {
    console.error(`[buyer-dashboard] ${what}: ${messageOf(e)}`);
    return null;
  }
}

function check<T>(what: string, res: { data: T | null; error: DbError | null }): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return (res.data ?? ([] as unknown)) as T;
}

/** The tile counts, over the same rows /buyer/orders reads (getOrdersByBuyer), only the columns buyerTab() needs. */
async function readCounts(userId: number): Promise<PurchaseCounts> {
  const db = createAdminClient();
  const rows = check(
    "orders",
    await db
      .from("im_orders")
      .select("id, order_status, payment_status, payment_provider")
      .eq("buyer_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
  ) as { id: number; order_status: string; payment_status: string; payment_provider: string | null }[];
  return countBuyerTabs(rows);
}

type RecentRow = {
  id: number;
  created_at: string;
  order_status: string;
  payment_status: string;
  payment_provider: string | null;
  total_amount: number;
  seller_id?: number | null;
};

const RECENT_COLUMNS = "id, created_at, order_status, payment_status, payment_provider, total_amount";

async function readRecent(userId: number): Promise<RecentOrderLite[]> {
  const db = createAdminClient();
  const newest = (columns: string) =>
    db
      .from("im_orders")
      .select(columns)
      .eq("buyer_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(RECENT);
  // im_orders.seller_id is migration 0015; before it, the shop comes from the first product's seller.
  let res = (await newest(`${RECENT_COLUMNS}, seller_id`)) as { data: RecentRow[] | null; error: DbError | null };
  if (res.error && isMissingObject(res.error)) {
    res = (await newest(RECENT_COLUMNS)) as { data: RecentRow[] | null; error: DbError | null };
  }
  const orders = check("recent orders", res);
  if (!orders.length) return [];

  const lines = check(
    "order lines",
    (await db
      .from("im_order_items")
      .select("id, order_id, product_id, quantity")
      .in(
        "order_id",
        orders.map((o) => o.id)
      )
      .order("id")) as { data: { id: number; order_id: number; product_id: number | null; quantity: number }[] | null; error: DbError | null }
  );
  const firstLine = new Map<number, { product_id: number | null }>();
  const units = new Map<number, number>();
  for (const l of lines) {
    if (!firstLine.has(l.order_id)) firstLine.set(l.order_id, l);
    units.set(l.order_id, (units.get(l.order_id) ?? 0) + (Number(l.quantity) || 0));
  }

  const productIds = [...firstLine.values()].map((l) => l.product_id).filter((n): n is number => n != null);
  // The orders were read; a failed thumbnail or shop-name lookup only costs
  // the photo, title or shop ("Item", the placeholder tile, no shop), never
  // the whole list.
  const products = new Map(((await attempt("order thumbnails", () => getProductThumbs(productIds))) ?? []).map((p) => [p.id, p]));

  const sellerOf = (o: RecentRow): number | null => {
    if (o.seller_id) return o.seller_id;
    const pid = firstLine.get(o.id)?.product_id;
    return pid != null ? (products.get(pid)?.seller_id ?? null) : null;
  };
  const sellerIds = [...new Set(orders.map(sellerOf).filter((n): n is number => n != null))];
  const shops = (await attempt("shop names", () => shopNames(sellerIds))) ?? new Map<number, string>();

  return orders.map((o) => {
    const pid = firstLine.get(o.id)?.product_id;
    const p = pid != null ? products.get(pid) : undefined;
    const seller = sellerOf(o);
    return {
      id: o.id,
      createdAt: o.created_at,
      status: o.order_status,
      statusText: buyerStatusText(o),
      total: Number(o.total_amount) || 0,
      title: p?.title ?? "Item",
      thumb: p?.images?.[0] ?? svgPlaceholder(p?.image),
      shop: seller != null ? shops.get(seller) || null : null,
      itemCount: units.get(o.id) ?? 0,
    };
  });
}

/** Each seller's shop name, or their public name before they set one (or on a database without 0019). Public fields only. */
async function shopNames(ids: number[]): Promise<Map<number, string>> {
  if (!ids.length) return new Map();
  const db = createAdminClient();
  type Row = { id: number; name: string | null; shop_name?: string | null };
  let res = (await db.from("im_profiles").select("id, name, shop_name").in("id", ids)) as { data: Row[] | null; error: DbError | null };
  if (res.error && isMissingObject(res.error)) {
    res = (await db.from("im_profiles").select("id, name").in("id", ids)) as { data: Row[] | null; error: DbError | null };
  }
  const rows = check("shop names", res);
  return new Map(rows.map((p) => [p.id, p.shop_name?.trim() || p.name?.trim() || ""]));
}

async function readWishlist(userId: number): Promise<BuyerWishlist> {
  const view = await getWishlistView(userId);
  return {
    items: view.items.slice(0, WISHLIST_SHOWN),
    total: view.items.length + view.unavailable.length,
    savedIds: view.items.map((i) => i.id),
  };
}

/**
 * Everything the buyer dashboard shows, for the signed-in buyer. `userId`
 * must be the session's own id (the page passes session.user_id); any other
 * id is refused before a single read.
 */
export async function getBuyerDashboard(userId: number): Promise<BuyerDashboard> {
  const session = await requireRole(["buyer"]);
  if (session.user_id !== userId) throw new Error("getBuyerDashboard reads only the signed-in buyer's own dashboard.");

  // Release stock held by online payments nobody finished, as /buyer/orders
  // does before its read, so both pages count the same orders. Throttled
  // (lib/payments/stock.ts); a failed sweep never blocks the page. Only the
  // two order widgets wait for it.
  const swept = expireStalePayments().catch((e) => {
    console.error(`[buyer-dashboard] payment sweep: ${messageOf(e)}`);
    return 0;
  });

  const [counts, recent, verification, wishlist, rec] = await Promise.all([
    attempt("order counts", () => swept.then(() => readCounts(userId))),
    attempt("recent orders", () => swept.then(() => readRecent(userId))),
    attempt("PWD verification", () => getMyVerification(userId)),
    attempt("wishlist", () => readWishlist(userId)),
    attempt("recommendations", () => getHomeRecommendations(userId)),
  ]);

  return { counts, recent, verification, wishlist, rec };
}

import "server-only";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DataUnavailableError,
  getDisplayNames,
  getOrderItemsForOrders,
  getOrderStatusHistoryForOrders,
  getVariantsByIds,
  getVariantsForProducts,
  hydrateImages,
} from "@/lib/data";
import { isMissingObject } from "@/lib/db-errors";
import { verificationLast4 } from "@/lib/pwd/data";
import { shortName } from "@/lib/format";
import { roundMoney } from "@/lib/pricing/core";
import { pageCount, pageOf, pageRange, searchId, searchPattern, type ListParams } from "@/lib/list-params";
import {
  SELLER_ORDER_TABS,
  SELLER_PRODUCT_TABS,
  type SellerOrderList,
  type SellerOrderRow,
  type SellerOrderTab,
  type SellerProductList,
  type SellerProductTab,
} from "@/lib/seller-list-types";
import type { OrderItem, OrderStatusHistoryEntry, Product } from "@/lib/types";

/**
 * Seller Centre lists, one page at a time (P3-05, 04 §6, the admin lists'
 * pattern of lib/admin-lists.ts): the rows of the page the URL asks for, a
 * count for every tab with the search applied, and the page that holds a
 * ?focus= row. P3-06 adds the products list here.
 *
 * Scoped to one seller, and only the session's: each reader takes no seller
 * id, its first line is requireRole(["seller"]), and every read is filtered
 * by that session's user_id, or by ids that came from a read so filtered.
 * Orders by im_orders.seller_id (0015); their lines, status history and
 * buyers' names by the ids of the page's orders; the lines kept only where
 * their product is this seller's (im_products.seller_id, for the products
 * those lines name), so an order from before the one-order-per-seller split
 * never shows another seller's lines or total; options and PWD ID endings
 * for those lines only. Products by im_products.seller_id; their photos and
 * options by the ids of the page's products.
 *
 * Search text never reaches a filter as text it could change, and no or()
 * is built: an order number ("12" or "#12") becomes .eq("id", n); anything
 * else is a buyer's name, matched with a plain .ilike() (searchPattern
 * escapes LIKE's wildcards) on the order's own buyer, joined through
 * im_orders.buyer_id, beside seller_id = me. So it finds only this seller's
 * buyers, however many people elsewhere share the name, and tells the
 * seller nothing about anyone else. Products: words are an .ilike() on the
 * title; a listing number is .in("id", …) of that number and the ids of
 * this seller's titles containing it, both beside seller_id = me.
 *
 * A database without im_orders.seller_id (before 0015) gives a `degraded`
 * empty orders list, never another seller's orders. Before 0016 no product
 * can be "archived" (im_products.status is text with a check, 0001), so the
 * Unpublished tab simply counts 0; should status ever be an enum without
 * that value, its count is null and the page names 0016 (statusUnknown).
 * Any other failure throws DataUnavailableError for the Seller Centre's
 * error boundary.
 */

type Db = ReturnType<typeof createAdminClient>;
type DbError = { code?: string; message: string };
type Sel = ReturnType<ReturnType<Db["from"]>["select"]>;

/**
 * The order's buyer, for a name search: an inner join, so only orders whose
 * buyer's name matches are kept (and counted). im_orders has a second key
 * to im_profiles (seller_id), hence the !buyer_id hint. Its one field never
 * reaches a row: the rows are built field by field below.
 */
const BUYER_JOIN = "buyer:im_profiles!buyer_id!inner(name)";
/** PostgREST's default max-rows: a lines read that returns this many may have been cut short. */
const ROW_CAP = 1000;

function fail(what: string, error: DbError): never {
  console.error(`[seller-lists] ${what}: ${error.message}`);
  throw new DataUnavailableError(what);
}

const isId = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;
const unique = (ids: readonly (number | null | undefined)[]) => [...new Set(ids.filter(isId))];

// ---------------------------------------------------------------------------
// Orders (P3-05)
// ---------------------------------------------------------------------------

const ORDER_COLUMNS =
  "id, created_at, buyer_id, order_status, payment_status, payment_provider, shipping_city, courier, tracking_number, delivered_at, return_reason, cancel_reason";

type OrderRead = {
  id: number;
  created_at: string;
  buyer_id: number;
  order_status: SellerOrderRow["order_status"];
  payment_status: SellerOrderRow["payment_status"];
  payment_provider: string | null;
  shipping_city: string | null;
  courier: string | null;
  tracking_number: string | null;
  delivered_at: string | null;
  return_reason: string | null;
  cancel_reason: string | null;
};

const noCounts = (): Record<SellerOrderTab, number | null> =>
  Object.fromEntries(SELLER_ORDER_TABS.map((t) => [t.value, null])) as Record<SellerOrderTab, number | null>;

/**
 * Seller Centre → Orders, one page: this seller's orders in the tab,
 * newest first, searched by order number ("12" or "#12") or by the buyer's
 * name, with each order's lines, history and PWD check for the rows shown.
 */
export async function getSellerOrderList(params: ListParams, tab: SellerOrderTab): Promise<SellerOrderList> {
  const session = await requireRole(["seller"]);
  const me = session.user_id;
  const db = createAdminClient();

  // Whether this database has im_orders.seller_id (one row of this
  // seller's; before 0015 the list cannot tell whose an order is). A GET,
  // not a HEAD request: a HEAD error has no body, so a missing column would
  // read as an outage.
  const probe = await db.from("im_orders").select("id").eq("seller_id", me).limit(1);
  if (probe.error) {
    if (isMissingObject(probe.error)) {
      return { rows: [], total: 0, page: 1, counts: noCounts(), focusMissing: false, degraded: true };
    }
    fail("orders", probe.error);
  }
  const id = params.q ? searchId(params.q) : null;
  const pattern = params.q && !id ? searchPattern(params.q) : null;
  // Search text with nothing left to match on (only punctuation) lists nothing.
  const nothing = Boolean(params.q) && !id && !pattern;

  // Every read of im_orders: these columns, plus the buyer join when a name is searched.
  const read = (columns: string, head = false): Sel =>
    db
      .from("im_orders")
      .select(pattern ? `${columns}, ${BUYER_JOIN}` : columns, head ? { count: "exact", head: true } : undefined);

  const scoped = (q: Sel, t: SellerOrderTab): Sel => {
    let out = q.eq("seller_id", me);
    if (t !== "all") out = out.eq("order_status", t);
    if (id) out = out.eq("id", id);
    else if (pattern) out = out.ilike("buyer.name", pattern);
    return out;
  };

  const countOf = async (t: SellerOrderTab): Promise<number> => {
    if (nothing) return 0;
    const { count, error } = await scoped(read("id", true), t);
    if (error) fail("order counts", error);
    return count ?? 0;
  };

  // Where ?focus= sits in this tab and search: this seller's orders newer
  // than it, and those as new with a higher id (the list's tie-break).
  const focusIndex = async (): Promise<number | null> => {
    if (!params.focus || nothing) return null;
    const hit = await scoped(read("id, created_at"), tab).eq("id", params.focus).maybeSingle();
    if (hit.error) fail("order", hit.error);
    const row = hit.data as { id: number; created_at: string } | null;
    if (!row) return null;
    const before = async (f: (q: Sel) => Sel) => {
      const { count, error } = await f(scoped(read("id", true), tab));
      if (error) fail("order position", error);
      return count ?? 0;
    };
    const [newer, sameTime] = await Promise.all([
      before((q) => q.gt("created_at", row.created_at)),
      before((q) => q.eq("created_at", row.created_at).gt("id", row.id)),
    ]);
    return newer + sameTime;
  };

  const tabs = SELLER_ORDER_TABS.map((t) => t.value);
  const [countList, index] = await Promise.all([Promise.all(tabs.map(countOf)), focusIndex()]);
  const counts = Object.fromEntries(tabs.map((t, i) => [t, countList[i]])) as Record<SellerOrderTab, number | null>;
  const total = countList[tabs.indexOf(tab)] ?? 0;

  const lastPage = pageCount(total, params.perPage);
  const page = index !== null ? pageOf(index, params.perPage) : Math.min(params.page, lastPage);
  const focusMissing = Boolean(params.focus) && index === null;

  if (nothing || total === 0) return { rows: [], total, page: 1, counts, focusMissing, degraded: false };

  const { from, to } = pageRange(page, params.perPage);
  const res = await scoped(read(ORDER_COLUMNS), tab)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (res.error) fail("orders", res.error);
  const list = (res.data ?? []) as unknown as OrderRead[];
  const orderIds = list.map((o) => o.id);

  // The page's orders only: their lines, their history, their buyers' names.
  const [lines, history, names] = await Promise.all([
    getOrderItemsForOrders(orderIds),
    getOrderStatusHistoryForOrders(orderIds),
    getDisplayNames(list.map((o) => o.buyer_id)),
  ]);
  if (lines.length >= ROW_CAP) console.warn("[seller-lists] order lines: the read reached the row cap; some lines may be missing.");

  // Which of those lines' products are this seller's (and their titles):
  // the products the lines name, filtered by seller_id = me. A line whose
  // product is another seller's, or was deleted, is left out, as before.
  const productIds = unique(lines.map((l) => l.product_id));
  const owned = productIds.length
    ? await db.from("im_products").select("id, title").eq("seller_id", me).in("id", productIds)
    : { data: [] as { id: number; title: string }[], error: null };
  if (owned.error) fail("seller products", owned.error);
  const titles = new Map(((owned.data ?? []) as { id: number; title: string }[]).map((p) => [p.id, p.title]));
  const mine: OrderItem[] = lines.filter((l) => l.product_id != null && titles.has(l.product_id));

  // Options and PWD ID endings for this seller's lines only.
  const [variants, last4] = await Promise.all([
    getVariantsByIds(unique(mine.map((l) => l.variant_id))),
    verificationLast4(unique(mine.map((l) => l.verification_id))),
  ]);
  const optionOf = new Map(
    variants.map((v) => [v.id, [v.color_name, v.size].filter(Boolean).join(" / ") || null] as const)
  );

  const byOrder = new Map<number, OrderItem[]>();
  for (const l of mine) {
    const at = byOrder.get(l.order_id);
    if (at) at.push(l);
    else byOrder.set(l.order_id, [l]);
  }

  const pwdCheck = (own: OrderItem[]): SellerOrderRow["pwdCheck"] => {
    const pwd = own.filter((l) => Number(l.pwd_discount_amount ?? 0) > 0);
    if (!pwd.length) return null;
    const vid = pwd.find((l) => l.verification_id)?.verification_id ?? null;
    return {
      amount: roundMoney(pwd.reduce((n, l) => n + Number(l.pwd_discount_amount ?? 0), 0)),
      last4: vid ? last4.get(vid) ?? null : null,
    };
  };

  // Field by field, so a column added to these tables later does not reach
  // the browser by itself. Of the shipping details only the city: the list
  // says where an order goes, and the packing slip reads the full address
  // for itself.
  const rows: SellerOrderRow[] = list.map((o) => {
    const own = byOrder.get(o.id) ?? [];
    return {
      id: o.id,
      created_at: o.created_at,
      order_status: o.order_status,
      payment_status: o.payment_status,
      payment_provider: o.payment_provider,
      shipping_city: o.shipping_city,
      courier: o.courier ?? null,
      tracking_number: o.tracking_number ?? null,
      delivered_at: o.delivered_at ?? null,
      return_reason: o.return_reason ?? null,
      cancel_reason: o.cancel_reason ?? null,
      buyerName: shortName(names[o.buyer_id]),
      items: own.map((l) => ({
        id: l.id,
        title: titles.get(l.product_id as number) ?? "Item",
        quantity: l.quantity,
        option: (l.variant_id != null && optionOf.get(l.variant_id)) || null,
      })),
      subtotal: roundMoney(own.reduce((n, l) => n + Number(l.unit_price) * l.quantity, 0)),
      pwdCheck: pwdCheck(own),
      history: (history[o.id] ?? []).map(
        (h): OrderStatusHistoryEntry => ({
          id: h.id,
          order_id: h.order_id,
          status: h.status,
          note: h.note,
          // Who made the change is a profile id (the buyer's, on a return
          // request), and the timeline does not show it.
          created_by: null,
          created_at: h.created_at,
        })
      ),
    };
  });

  return { rows, total, page, counts, focusMissing, degraded: false };
}

// ---------------------------------------------------------------------------
// Products (P3-06)
// ---------------------------------------------------------------------------

/**
 * How many of this seller's titles a number search adds beside the listing
 * number itself before the list says it was cut short. Their ids go into the
 * URL once (.in("id", …)): 200 ids of up to 7 digits, with each comma sent
 * as %2C, come to about 2 KB.
 */
const TITLE_MATCHES = 200;

/**
 * "This database does not know that status": the column or value is missing
 * (isMissingObject), or the status is an enum without "archived" (22P02,
 * invalid input value). Only ever asked of the Unpublished tab's reads.
 */
const statusUnknown = (e: DbError) => isMissingObject(e) || e.code === "22P02";

/**
 * The fields the products list and the wizard use, one by one, so a column
 * added to im_products later (or one only admins need: who moderated it,
 * the search vector) does not reach the browser by itself. moderation_reason
 * and adaptive_tags are absent before 0016.
 */
function productFields(p: Product): Product {
  return {
    id: p.id,
    seller_id: p.seller_id,
    title: p.title,
    description: p.description ?? null,
    base_price: Number(p.base_price) || 0,
    category: p.category ?? null,
    image: p.image ?? null,
    status: p.status,
    is_featured: Boolean(p.is_featured),
    created_at: p.created_at,
    updated_at: p.updated_at,
    moderation_reason: p.moderation_reason ?? null,
    adaptive_tags: Array.isArray(p.adaptive_tags) ? p.adaptive_tags : [],
  };
}

/**
 * Seller Centre → Products, one page: this seller's products in the tab,
 * newest first, searched by title words or by listing number ("12" or
 * "#12", which also finds titles containing 12), with their photos and
 * options for the rows shown.
 */
export async function getSellerProductList(params: ListParams, tab: SellerProductTab): Promise<SellerProductList> {
  const session = await requireRole(["seller"]);
  const me = session.user_id;
  const db = createAdminClient();

  // The search. Words: the title, by a plain .ilike() beside seller_id = me.
  // A number: that listing, or one of this seller's titles containing the
  // number; those titles are read first (seller_id = me), and the list is
  // then .in("id", …) of numbers only, again beside seller_id = me, so the
  // typed number never shows another seller's product.
  const id = params.q ? searchId(params.q) : null;
  const pattern = params.q ? searchPattern(id ? String(id) : params.q) : null;
  let ids: number[] | null = null;
  let capped = false;
  if (id) {
    const res = await db
      .from("im_products")
      .select("id")
      .eq("seller_id", me)
      .ilike("title", pattern as string)
      .order("id", { ascending: false })
      .limit(TITLE_MATCHES + 1);
    if (res.error) fail("product search", res.error);
    const found = ((res.data ?? []) as { id: number }[]).map((r) => r.id).filter(isId);
    capped = found.length > TITLE_MATCHES;
    ids = unique([id, ...found.slice(0, TITLE_MATCHES)]);
  }
  // Search text with nothing left to match on (only punctuation) lists nothing.
  const nothing = Boolean(params.q) && !id && !pattern;

  const scoped = (q: Sel, t: SellerProductTab): Sel => {
    let out = q.eq("seller_id", me);
    if (t !== "all") out = out.eq("status", t);
    if (ids) out = out.in("id", ids);
    else if (pattern) out = out.ilike("title", pattern);
    return out;
  };

  // Each tab's count. Unpublished ("archived", 0016) is counted with a GET
  // of at most one row, not a HEAD request: a HEAD error has no body, so a
  // status this database does not know would read as an outage. On this
  // schema (text with a check) that cannot happen, and a database before
  // 0016 just counts 0; the guard is for a status typed as an enum, where
  // the error gives a null count and the degraded note, never a page error.
  let degraded = false;
  const countOf = async (t: SellerProductTab): Promise<number | null> => {
    if (nothing) return 0;
    if (t === "archived") {
      const { count, error } = await scoped(db.from("im_products").select("id", { count: "exact" }), t).limit(1);
      if (error) {
        if (statusUnknown(error)) {
          degraded = true;
          return null;
        }
        fail("product counts", error);
      }
      return count ?? 0;
    }
    const { count, error } = await scoped(db.from("im_products").select("id", { count: "exact", head: true }), t);
    if (error) fail("product counts", error);
    return count ?? 0;
  };

  // Where ?focus= sits in this tab and search: this seller's products newer
  // than it, and those as new with a higher id (the list's tie-break).
  const focusIndex = async (): Promise<number | null> => {
    if (!params.focus || nothing) return null;
    const hit = await scoped(db.from("im_products").select("id, created_at"), tab).eq("id", params.focus).maybeSingle();
    if (hit.error) {
      // The Unpublished tab on a database without the status: not here.
      if (tab === "archived" && statusUnknown(hit.error)) return null;
      fail("product", hit.error);
    }
    const row = hit.data as { id: number; created_at: string } | null;
    if (!row) return null;
    const before = async (f: (q: Sel) => Sel) => {
      const { count, error } = await f(scoped(db.from("im_products").select("id", { count: "exact", head: true }), tab));
      if (error) fail("product position", error);
      return count ?? 0;
    };
    const [newer, sameTime] = await Promise.all([
      before((q) => q.gt("created_at", row.created_at)),
      before((q) => q.eq("created_at", row.created_at).gt("id", row.id)),
    ]);
    return newer + sameTime;
  };

  const tabs = SELLER_PRODUCT_TABS.map((t) => t.value);
  const [countList, index] = await Promise.all([Promise.all(tabs.map(countOf)), focusIndex()]);
  const counts = Object.fromEntries(tabs.map((t, i) => [t, countList[i]])) as Record<SellerProductTab, number | null>;
  const total = countList[tabs.indexOf(tab)] ?? 0;

  const lastPage = pageCount(total, params.perPage);
  const page = index !== null ? pageOf(index, params.perPage) : Math.min(params.page, lastPage);
  const focusMissing = Boolean(params.focus) && index === null;

  const empty = { products: [], variants: [], total, page: 1, counts, capped, focusMissing, degraded };
  if (nothing || total === 0) return empty;

  const { from, to } = pageRange(page, params.perPage);
  const res = await scoped(db.from("im_products").select("*"), tab)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (res.error) fail("products", res.error);
  const list = ((res.data ?? []) as unknown as Product[]).map(productFields);

  // The page's products only (their ids came from the read above, scoped to
  // this seller): their photos, as getProductsBySeller hydrates them, and
  // their options, which the stock column and the wizard read.
  const productIds = list.map((p) => p.id);
  const [products, variants] = await Promise.all([hydrateImages(list), getVariantsForProducts(productIds)]);

  return { products, variants, total, page, counts, capped, focusMissing, degraded };
}

import "server-only";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DataUnavailableError, getDisplayNames } from "@/lib/data";
import { isMissingObject } from "@/lib/db-errors";
import { pageCount, pageOf, pageRange, searchId, searchPattern, type ListParams } from "@/lib/list-params";
import { ORDER_VIEWS, type AdminOrderList, type AdminOrderRow, type OrderView } from "@/lib/admin-list-types";

/**
 * Admin lists, one page at a time (ADR-05, 03 §6): the rows of the page the
 * URL asks for, a count for every tab with the search applied, and the page
 * that holds a ?focus= row. The browser receives one page of rows, field by
 * field, never a table.
 *
 * Search text never reaches a filter as text it could change: an order
 * number becomes `id.eq.<n>`, and a name is matched with a plain .ilike()
 * (searchPattern escapes LIKE's wildcards and drops or()'s grammar) whose
 * result is a list of profile ids; the orders' or() is then built from
 * numbers only.
 *
 * Admin only, and every reader checks so itself (requireRole), so a later
 * "use server" wrapper or a page outside app/admin/ cannot list every order
 * (scripts/check-page-props.mjs rule 3 also refuses the import there).
 * A read that needs a migration this database lacks degrades; any other
 * failure throws DataUnavailableError for the page's error boundary.
 */

type Db = ReturnType<typeof createAdminClient>;
type DbError = { code?: string; message: string };
type Sel = ReturnType<ReturnType<Db["from"]>["select"]>;

/**
 * How many people a name search may match before the list says it was cut
 * short. Their ids go into the URL twice (as buyer and as shop): 200 ids of
 * up to 7 digits, with each comma sent as %2C, come to about 4.4 KB, well
 * inside a proxy's 8 KB limit.
 */
const NAME_MATCHES = 200;

function fail(what: string, error: DbError): never {
  console.error(`[admin-lists] ${what}: ${error.message}`);
  throw new DataUnavailableError(what);
}

const isId = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;

/**
 * Profile ids whose name, or shop name (0019), matches the pattern, newest
 * first; `capped` when more matched than are kept.
 */
async function peopleMatching(db: Db, pattern: string): Promise<{ ids: number[]; capped: boolean }> {
  const byName = await db.from("im_profiles").select("id").ilike("name", pattern).order("id", { ascending: false }).limit(NAME_MATCHES + 1);
  if (byName.error) fail("people search", byName.error);
  const byShop = await db.from("im_profiles").select("id").ilike("shop_name", pattern).order("id", { ascending: false }).limit(NAME_MATCHES + 1);
  if (byShop.error && !isMissingObject(byShop.error)) fail("shop search", byShop.error);
  const a = ((byName.data ?? []) as { id: number }[]).map((r) => r.id);
  const b = byShop.error ? [] : ((byShop.data ?? []) as { id: number }[]).map((r) => r.id);
  const ids = [...new Set([...a, ...b])].filter(isId);
  return { ids: ids.slice(0, NAME_MATCHES), capped: ids.length > NAME_MATCHES };
}

/** Each seller's shop name, or their own name before they set one (or before 0019). */
async function shopNames(db: Db, ids: readonly number[]): Promise<Record<number, string>> {
  const unique = [...new Set(ids.filter(isId))];
  if (!unique.length) return {};
  let res: { data: { id: number; name: string | null; shop_name?: string | null }[] | null; error: DbError | null } = await db
    .from("im_profiles")
    .select("id, name, shop_name")
    .in("id", unique);
  if (res.error && isMissingObject(res.error)) res = await db.from("im_profiles").select("id, name").in("id", unique);
  if (res.error) fail("shop names", res.error);
  return Object.fromEntries((res.data ?? []).map((p) => [p.id, p.shop_name?.trim() || p.name?.trim() || ""]));
}

// ---------------------------------------------------------------------------
// Orders (P2-07)
// ---------------------------------------------------------------------------

// The tabs and row shapes live in lib/admin-list-types.ts, so the list
// components can use them without importing this module.
export { ORDER_VIEWS, orderView } from "@/lib/admin-list-types";
export type { AdminOrderList, AdminOrderRow, OrderView } from "@/lib/admin-list-types";

const ORDER_COLUMNS = "id, created_at, buyer_id, seller_id, total_amount, payment_provider, payment_status, order_status, refund_due, return_reason, cancel_reason";
const ORDER_COLUMNS_BASE = "id, created_at, buyer_id, total_amount, payment_provider, payment_status, order_status";

type OrderRead = {
  id: number;
  created_at: string;
  buyer_id: number;
  seller_id?: number | null;
  total_amount: number | string;
  payment_provider: string | null;
  payment_status: string;
  order_status: string;
  refund_due?: boolean | null;
  return_reason?: string | null;
  cancel_reason?: string | null;
};

/** The filter of a view; `legacy` is a database before 0014/0015. null: the view cannot exist there. */
function viewFilter(view: OrderView, legacy: boolean): ((q: Sel) => Sel) | null {
  switch (view) {
    case "refunds":
      return legacy ? null : (q) => q.eq("refund_due", true);
    case "returns":
      return (q) => q.eq("order_status", "return_requested");
    case "open":
      return (q) => q.in("order_status", ["pending", "processing", "shipped"]);
    case "cancelled":
      return (q) => q.eq("order_status", "cancelled");
    default:
      return (q) => q;
  }
}

/**
 * Admin → Orders, one page: the view's orders, newest first, searched by
 * order number ("123" or "#123") or by the buyer's or shop's name.
 */
export async function getAdminOrderList(params: ListParams, view: OrderView): Promise<AdminOrderList> {
  await requireRole(["admin"]);
  const db = createAdminClient();

  // Two reads at once: whether this database has the 0014/0015 columns (one
  // row; before them the list uses the base columns, has no refunds view
  // and searches buyers only), and the people a name matches.
  const id = params.q ? searchId(params.q) : null;
  const pattern = params.q ? searchPattern(params.q) : null;
  // A GET, not a HEAD request: a HEAD error has no body, so it carries no
  // error code and a missing column would read as an outage (security review).
  const [probe, people] = await Promise.all([
    db.from("im_orders").select(ORDER_COLUMNS).limit(1),
    pattern ? peopleMatching(db, pattern) : Promise.resolve({ ids: [] as number[], capped: false }),
  ]);
  if (probe.error && !isMissingObject(probe.error)) fail("orders", probe.error);
  const legacy = Boolean(probe.error);
  const capped = people.capped;

  // The search, as numbers only: an order number, and the matched people as
  // buyer or (from 0015) as shop. Typed text that matches nothing lists nothing.
  let searchOr: string | null = null;
  if (params.q) {
    const terms: string[] = [];
    if (id) terms.push(`id.eq.${id}`);
    if (people.ids.length) {
      const list = people.ids.join(",");
      terms.push(`buyer_id.in.(${list})`);
      if (!legacy) terms.push(`seller_id.in.(${list})`);
    }
    searchOr = terms.length ? terms.join(",") : null;
  }
  const nothing = Boolean(params.q) && !searchOr;

  const scoped = (q: Sel, v: OrderView): Sel | null => {
    const f = viewFilter(v, legacy);
    if (!f) return null;
    const viewed = f(q);
    return searchOr ? viewed.or(searchOr) : viewed;
  };

  const countOf = async (v: OrderView): Promise<number | null> => {
    if (nothing) return 0;
    const q = scoped(db.from("im_orders").select("id", { count: "exact", head: true }), v);
    if (!q) return null;
    const { count, error } = await q;
    if (error) {
      if (isMissingObject(error)) return null;
      fail("order counts", error);
    }
    return count ?? 0;
  };

  // Where ?focus= sits in this view and search: the orders newer than it,
  // and those as new with a higher id (the list's tie-break), counted.
  const focusIndex = async (): Promise<number | null> => {
    if (!params.focus || nothing) return null;
    const base = scoped(db.from("im_orders").select("id, created_at"), view);
    if (!base) return null;
    const hit = await base.eq("id", params.focus).maybeSingle();
    if (hit.error) fail("order", hit.error);
    const row = hit.data as { id: number; created_at: string } | null;
    if (!row) return null;
    const before = async (f: (q: Sel) => Sel) => {
      const q = scoped(db.from("im_orders").select("id", { count: "exact", head: true }), view);
      const { count, error } = await f(q as Sel);
      if (error) fail("order position", error);
      return count ?? 0;
    };
    const [newer, sameTime] = await Promise.all([
      before((q) => q.gt("created_at", row.created_at)),
      before((q) => q.eq("created_at", row.created_at).gt("id", row.id)),
    ]);
    return newer + sameTime;
  };

  const views = ORDER_VIEWS.map((v) => v.value);
  const [countList, index] = await Promise.all([Promise.all(views.map(countOf)), focusIndex()]);
  const counts = Object.fromEntries(views.map((v, i) => [v, countList[i]])) as Record<OrderView, number | null>;
  const total = counts[view] ?? 0;

  const lastPage = pageCount(total, params.perPage);
  const page = index !== null ? pageOf(index, params.perPage) : Math.min(params.page, lastPage);
  const focusMissing = Boolean(params.focus) && index === null;

  if (nothing || total === 0) {
    return { rows: [], total, page: 1, counts, capped, focusMissing, degraded: legacy };
  }

  const { from, to } = pageRange(page, params.perPage);
  const q = scoped(db.from("im_orders").select(legacy ? ORDER_COLUMNS_BASE : ORDER_COLUMNS), view);
  if (!q) return { rows: [], total: 0, page: 1, counts, capped, focusMissing, degraded: legacy };
  const res = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
  if (res.error) fail("orders", res.error);
  const list = (res.data ?? []) as unknown as OrderRead[];

  const [buyers, shops] = await Promise.all([
    getDisplayNames(list.map((o) => o.buyer_id)),
    shopNames(db, list.map((o) => o.seller_id ?? 0)),
  ]);

  const rows: AdminOrderRow[] = list.map((o) => ({
    id: o.id,
    createdAt: o.created_at,
    buyerName: buyers[o.buyer_id] || `Buyer #${o.buyer_id}`,
    sellerName: o.seller_id ? shops[o.seller_id] || `Shop #${o.seller_id}` : null,
    total: Number(o.total_amount) || 0,
    paymentProvider: o.payment_provider,
    paymentStatus: o.payment_status,
    status: o.order_status,
    refundDue: Boolean(o.refund_due),
    returnReason: o.return_reason ?? null,
    cancelReason: o.cancel_reason ?? null,
  }));

  return { rows, total, page, counts, capped, focusMissing, degraded: legacy };
}

import "server-only";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DataUnavailableError, getAllCategories, getDisplayNames } from "@/lib/data";
import { isMissingObject } from "@/lib/db-errors";
import { verifiedAmongIfAvailable } from "@/lib/pwd/data";
import { pageCount, pageOf, pageRange, searchId, searchPattern, type ListParams } from "@/lib/list-params";
import {
  ORDER_VIEWS,
  PRODUCT_TABS,
  USER_ROLES,
  USER_STATUSES,
  type AdminOrderList,
  type AdminOrderRow,
  type AdminProductList,
  type AdminProductRow,
  type OrderView,
  type ProductTab,
  type AdminUserList,
  type AdminUserRow,
  type UserFootprint,
  type UserRoleTab,
  type UserStatusTab,
} from "@/lib/admin-list-types";
import type { Product } from "@/lib/types";

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
 * first; `capped` when more matched than are kept. `role` keeps one kind of
 * account (the products list searches sellers: buyers' names would only
 * fill the cap).
 */
async function peopleMatching(db: Db, pattern: string, role?: "seller"): Promise<{ ids: number[]; capped: boolean }> {
  const by = (col: "name" | "shop_name") => {
    const q = db.from("im_profiles").select("id").ilike(col, pattern);
    return (role ? q.eq("role", role) : q).order("id", { ascending: false }).limit(NAME_MATCHES + 1);
  };
  const byName = await by("name");
  if (byName.error) fail("people search", byName.error);
  const byShop = await by("shop_name");
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
export { ORDER_VIEWS, PRODUCT_TABS, USER_ROLES, USER_STATUSES, orderView, productTab, userRole, userStatus } from "@/lib/admin-list-types";
export type {
  AdminOrderList,
  AdminOrderRow,
  AdminProductList,
  AdminProductRow,
  AdminUserList,
  AdminUserRow,
  OrderView,
  ProductTab,
  UserFootprint,
  UserRoleTab,
  UserStatusTab,
} from "@/lib/admin-list-types";

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

// ---------------------------------------------------------------------------
// Products (P2-08)
// ---------------------------------------------------------------------------

const EXCERPT = 90;
const PHOTOS = 3;

/** Product ids whose title matches, newest first; `capped` when more matched than are kept. */
async function titlesMatching(db: Db, pattern: string): Promise<{ ids: number[]; capped: boolean }> {
  const res = await db.from("im_products").select("id").ilike("title", pattern).order("id", { ascending: false }).limit(NAME_MATCHES + 1);
  if (res.error) fail("product search", res.error);
  const ids = ((res.data ?? []) as { id: number }[]).map((r) => r.id).filter(isId);
  return { ids: ids.slice(0, NAME_MATCHES), capped: ids.length > NAME_MATCHES };
}

/**
 * The first photos of each listing, in their order, and how many it has
 * (a reviewer judges the count; the other photos stay on the server).
 */
async function firstPhotos(db: Db, ids: readonly number[]): Promise<Record<number, { urls: string[]; count: number }>> {
  if (!ids.length) return {};
  const res = await db.from("im_product_images").select("product_id, url, position").in("product_id", [...ids]).order("position");
  if (res.error) fail("product photos", res.error);
  const map: Record<number, { urls: string[]; count: number }> = {};
  for (const r of (res.data ?? []) as { product_id: number; url: string }[]) {
    const entry = (map[r.product_id] ||= { urls: [], count: 0 });
    entry.count++;
    if (entry.urls.length < PHOTOS) entry.urls.push(r.url);
  }
  return map;
}

type ProductRead = Product & { moderation_reason?: string | null };

/**
 * Admin → Products, one page: the tab's listings, newest first, searched by
 * listing number, by title, or by the seller's or shop's name.
 */
export async function getAdminProductList(params: ListParams, tab: ProductTab): Promise<AdminProductList> {
  await requireRole(["admin"]);
  const db = createAdminClient();

  // The search, as ids: the typed number, the titles that match and the
  // sellers whose name or shop matches. Up to 401 ids reach the URL (each
  // up to 7 digits, as for orders, each comma sent as %2C: about 4 KB,
  // inside a proxy's 8 KB). Text that matches nothing lists nothing.
  const id = params.q ? searchId(params.q) : null;
  const pattern = params.q ? searchPattern(params.q) : null;
  const none = { ids: [] as number[], capped: false };
  const [titles, people] = await Promise.all([
    pattern ? titlesMatching(db, pattern) : Promise.resolve(none),
    pattern ? peopleMatching(db, pattern, "seller") : Promise.resolve(none),
  ]);
  const capped = titles.capped || people.capped;

  let searchOr: string | null = null;
  if (params.q) {
    const ids = [...new Set([...(id ? [id] : []), ...titles.ids])];
    const terms: string[] = [];
    if (ids.length) terms.push(`id.in.(${ids.join(",")})`);
    if (people.ids.length) terms.push(`seller_id.in.(${people.ids.join(",")})`);
    searchOr = terms.length ? terms.join(",") : null;
  }
  const nothing = Boolean(params.q) && !searchOr;

  const scoped = (q: Sel, t: ProductTab): Sel => {
    const viewed = t === "all" ? q : q.eq("status", t);
    return searchOr ? viewed.or(searchOr) : viewed;
  };

  const countOf = async (t: ProductTab): Promise<number> => {
    if (nothing) return 0;
    const { count, error } = await scoped(db.from("im_products").select("id", { count: "exact", head: true }), t);
    if (error) fail("product counts", error);
    return count ?? 0;
  };

  // Where ?focus= sits in this tab and search (as for orders).
  const focusIndex = async (): Promise<number | null> => {
    if (!params.focus || nothing) return null;
    const hit = await scoped(db.from("im_products").select("id, created_at"), tab).eq("id", params.focus).maybeSingle();
    if (hit.error) fail("product", hit.error);
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

  const tabs = PRODUCT_TABS.map((t) => t.value);
  const [countList, index] = await Promise.all([Promise.all(tabs.map(countOf)), focusIndex()]);
  const counts = Object.fromEntries(tabs.map((t, i) => [t, countList[i]])) as Record<ProductTab, number>;
  const total = counts[tab];

  const lastPage = pageCount(total, params.perPage);
  const page = index !== null ? pageOf(index, params.perPage) : Math.min(params.page, lastPage);
  const focusMissing = Boolean(params.focus) && index === null;

  const noGaps = { featureWindow: false, moderationReason: false };
  if (nothing || total === 0) return { rows: [], total, page: 1, counts, capped, focusMissing, degraded: noGaps };

  // select("*") reads whichever of the 0016/0021 columns this database has;
  // only the fields below leave this module.
  const { from, to } = pageRange(page, params.perPage);
  const res = await scoped(db.from("im_products").select("*"), tab)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (res.error) fail("products", res.error);
  const list = (res.data ?? []) as unknown as ProductRead[];
  // select("*") returns the columns this database has: a missing one is a
  // migration it lacks (0021 the feature window, 0016 the reason).
  const first = (list[0] ?? {}) as unknown as Record<string, unknown>;
  const degraded = list.length
    ? { featureWindow: !("featured_position" in first), moderationReason: !("moderation_reason" in first) }
    : noGaps;

  const [photos, shops, categories] = await Promise.all([
    firstPhotos(db, list.map((p) => p.id)),
    shopNames(db, list.map((p) => p.seller_id)),
    getAllCategories(),
  ]);
  const label = new Map(categories.map((c) => [c.id, c.label]));

  const rows: AdminProductRow[] = list.map((p) => {
    const text = (p.description ?? "").trim();
    return {
      id: p.id,
      title: p.title,
      image: p.image,
      base_price: Number(p.base_price) || 0,
      status: p.status,
      is_featured: Boolean(p.is_featured),
      created_at: p.created_at,
      excerpt: text.length > EXCERPT ? `${text.slice(0, EXCERPT)}…` : text,
      images: photos[p.id]?.urls ?? [],
      photoCount: photos[p.id]?.count ?? 0,
      sellerName: shops[p.seller_id] || `Seller #${p.seller_id}`,
      categoryLabel: (p.category && label.get(p.category)) || p.category || "Uncategorized",
      moderationReason: p.moderation_reason ?? null,
      featured_position: p.featured_position ?? null,
      featured_from: p.featured_from ?? null,
      featured_until: p.featured_until ?? null,
    };
  });

  return { rows, total, page, counts, capped, focusMissing, degraded };
}

// ---------------------------------------------------------------------------
// Users (P2-09)
// ---------------------------------------------------------------------------

/** Profile ids whose name, email or shop name (0019) matches; `capped` when more matched than are kept. */
async function accountsMatching(db: Db, pattern: string): Promise<{ ids: number[]; capped: boolean }> {
  const by = async (col: "name" | "email" | "shop_name") =>
    db.from("im_profiles").select("id").ilike(col, pattern).order("id", { ascending: false }).limit(NAME_MATCHES + 1);
  const [name, email, shop] = await Promise.all([by("name"), by("email"), by("shop_name")]);
  if (name.error) fail("account search", name.error);
  if (email.error) fail("account search", email.error);
  if (shop.error && !isMissingObject(shop.error)) fail("account search", shop.error);
  const pick = (r: { data: unknown }) => ((r.data ?? []) as { id: number }[]).map((x) => x.id);
  const ids = [...new Set([...pick(name), ...pick(email), ...(shop.error ? [] : pick(shop))])].filter(isId);
  return { ids: ids.slice(0, NAME_MATCHES), capped: ids.length > NAME_MATCHES };
}

/**
 * How much each of these accounts has done: products listed, orders placed,
 * reviews written, tickets and consent records. One id column per table,
 * for these accounts only, read in 1,000-row pages so a busy account is
 * counted in full (PostgREST returns at most 1,000 rows a request).
 * A table this database lacks counts 0.
 */
async function footprintsFor(db: Db, ids: readonly number[]): Promise<Map<number, UserFootprint>> {
  const out = new Map<number, UserFootprint>();
  for (const id of ids) out.set(id, { products: 0, orders: 0, reviews: 0, tickets: 0, consents: 0 });
  if (!ids.length) return out;
  const PAGE = 1000;
  const MAX_PAGES = 50;
  const tally = async (table: string, col: string, key: keyof UserFootprint) => {
    for (let n = 0; n < MAX_PAGES; n++) {
      const res = await db
        .from(table)
        .select(col)
        .in(col, [...ids])
        .order("id")
        .range(n * PAGE, n * PAGE + PAGE - 1);
      if (res.error) {
        if (isMissingObject(res.error)) return;
        fail(`${key} counts`, res.error);
      }
      const page = (res.data ?? []) as unknown as Record<string, number | null>[];
      for (const r of page) {
        const f = r[col] != null ? out.get(r[col] as number) : undefined;
        if (f) f[key]++;
      }
      if (page.length < PAGE) return;
    }
    console.error(`[admin-lists] ${key} counts stopped at ${MAX_PAGES * PAGE} rows`);
  };
  await Promise.all([
    tally("im_products", "seller_id", "products"),
    tally("im_orders", "buyer_id", "orders"),
    tally("im_product_reviews", "buyer_id", "reviews"),
    tally("im_support_tickets", "user_id", "tickets"),
    tally("im_consent_logs", "user_id", "consents"),
  ]);
  return out;
}

const USER_COLUMNS =
  "id, name, email, role, disability_type, assistive_needs, is_featured_seller, seller_story, account_status, created_at, updated_at";

/**
 * Admin → Users, one page: accounts by name (then id), filtered by role and
 * status, searched by account number, name, email or shop name.
 */
export async function getAdminUserList(params: ListParams, role: UserRoleTab, status: UserStatusTab): Promise<AdminUserList> {
  await requireRole(["admin"]);
  const db = createAdminClient();

  const id = params.q ? searchId(params.q) : null;
  const pattern = params.q ? searchPattern(params.q) : null;
  const matched = pattern ? await accountsMatching(db, pattern) : { ids: [] as number[], capped: false };
  const searchIds = params.q ? [...new Set([...(id ? [id] : []), ...matched.ids])] : null;
  const nothing = searchIds !== null && searchIds.length === 0;
  const capped = matched.capped;

  const scoped = (q: Sel, r: UserRoleTab, s: UserStatusTab): Sel => {
    let out = q;
    if (r !== "all") out = out.eq("role", r);
    if (s !== "any") out = out.eq("account_status", s);
    if (searchIds) out = out.in("id", searchIds);
    return out;
  };
  // A count-only query typed as Sel, so scoped() can take it. The builder's
  // inferred type is too deep for TypeScript to compare (TS2589), hence the
  // cast through unknown; the query itself is the same as a typed one.
  const head = (): Sel => db.from("im_profiles").select("id", { count: "exact", head: true }) as unknown as Sel;
  // The current role and status appear in both tab rows: counted once.
  const counted = new Map<string, Promise<number>>();
  const countOf = (r: UserRoleTab, s: UserStatusTab): Promise<number> => {
    const key = `${r}|${s}`;
    let p = counted.get(key);
    if (!p) {
      p = (async () => {
        if (nothing) return 0;
        const { count, error } = await scoped(head(), r, s);
        if (error) fail("account counts", error);
        return count ?? 0;
      })();
      counted.set(key, p);
    }
    return p;
  };

  // Where ?focus= sits: the accounts before it by name, and those with the
  // same name and a lower id (the list's tie-break), counted.
  const focusIndex = async (): Promise<number | null> => {
    if (!params.focus || nothing) return null;
    const hit = await scoped(db.from("im_profiles").select("id, name"), role, status).eq("id", params.focus).maybeSingle();
    if (hit.error) fail("account", hit.error);
    const row = hit.data as { id: number; name: string } | null;
    if (!row) return null;
    const before = async (f: (q: Sel) => Sel) => {
      const { count, error } = await f(scoped(head(), role, status));
      if (error) fail("account position", error);
      return count ?? 0;
    };
    const [earlier, sameName] = await Promise.all([
      before((q) => q.lt("name", row.name)),
      before((q) => q.eq("name", row.name).lt("id", row.id)),
    ]);
    return earlier + sameName;
  };

  const roles = USER_ROLES.map((r) => r.value);
  const statuses = USER_STATUSES.map((s) => s.value);
  const [roleList, statusList, index] = await Promise.all([
    Promise.all(roles.map((r) => countOf(r, status))),
    Promise.all(statuses.map((s) => countOf(role, s))),
    focusIndex(),
  ]);
  const roleCounts = Object.fromEntries(roles.map((r, i) => [r, roleList[i]])) as Record<UserRoleTab, number>;
  const statusCounts = Object.fromEntries(statuses.map((s, i) => [s, statusList[i]])) as Record<UserStatusTab, number>;
  const total = roleCounts[role];

  const lastPage = pageCount(total, params.perPage);
  const page = index !== null ? pageOf(index, params.perPage) : Math.min(params.page, lastPage);
  const focusMissing = Boolean(params.focus) && index === null;

  if (nothing || total === 0) return { rows: [], total, page: 1, roleCounts, statusCounts, capped, focusMissing };

  const { from, to } = pageRange(page, params.perPage);
  const res = await scoped(db.from("im_profiles").select(USER_COLUMNS), role, status)
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to);
  if (res.error) fail("accounts", res.error);
  const list = (res.data ?? []) as unknown as Omit<AdminUserRow, "footprint" | "verified">[];

  const ids = list.map((u) => u.id);
  const [footprints, verified] = await Promise.all([footprintsFor(db, ids), verifiedAmongIfAvailable(ids)]);
  const empty: UserFootprint = { products: 0, orders: 0, reviews: 0, tickets: 0, consents: 0 };

  // Field by field, so a column added to im_profiles later does not reach
  // the browser by itself.
  const rows: AdminUserRow[] = list.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    disability_type: u.disability_type,
    assistive_needs: u.assistive_needs,
    is_featured_seller: Boolean(u.is_featured_seller),
    seller_story: u.seller_story,
    account_status: u.account_status,
    created_at: u.created_at,
    updated_at: u.updated_at,
    footprint: footprints.get(u.id) ?? empty,
    verified: verified === null ? null : verified.has(u.id),
  }));

  return { rows, total, page, roleCounts, statusCounts, capped, focusMissing };
}

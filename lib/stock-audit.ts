import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DataUnavailableError } from "@/lib/data";
import { isMissingObject } from "@/lib/db-errors";
import { episodeState, soldOutEpisodes, type EpisodeState, type StockEvent } from "@/lib/stock-episodes";

/**
 * Admin → Sold-out audit (migration 0027): when each listing sold out, how
 * many units it has sold and where it stands now; and the item history,
 * every photo taken off a listing and every listing deleted, kept with the
 * old photos. The Excel export reads the same, with a higher limit. Each
 * part is null before 0027, so the page can say which migration it needs.
 * The caller checks that the viewer is an admin.
 */

type Db = ReturnType<typeof createAdminClient>;
type Res = { data: unknown; error: { message: string; code?: string } | null };

/** PostgREST answers at most this many rows per request. */
const PAGE = 1000;
/** Ids per .in() filter, so the URL stays short. */
const CHUNK = 150;

function fail(what: string, error: { message: string }): never {
  console.error(`[stock-audit] ${what}: ${error.message}`);
  throw new DataUnavailableError(what);
}

/** Up to `max` rows, a page at a time; null when the table is not there yet. */
async function readPaged<T>(what: string, max: number, read: (from: number, to: number) => PromiseLike<Res>): Promise<T[] | null> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const to = Math.min(from + PAGE, max) - 1;
    const { data, error } = await read(from, to);
    if (error) {
      if (from === 0 && isMissingObject(error)) return null;
      fail(what, error);
    }
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < to - from + 1) break;
  }
  return out;
}

async function readIn<T>(what: string, ids: number[], read: (chunk: number[]) => PromiseLike<Res>): Promise<T[]> {
  const unique = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await read(unique.slice(i, i + CHUNK));
    if (error) fail(what, error);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

async function namesOf(db: Db, ids: number[]): Promise<Map<number, string>> {
  const rows = await readIn<{ id: number; name: string }>("names", ids, (chunk) =>
    db.from("im_profiles").select("id, name").in("id", chunk)
  );
  return new Map(rows.map((r) => [r.id, r.name]));
}

// ---------------------------------------------------------------------------
// Sold out
// ---------------------------------------------------------------------------

export interface SoldOutRow {
  eventId: number;
  productId: number;
  title: string;
  sellerId: number | null;
  sellerName: string;
  category: string | null;
  /** The listing's first photo now, if it has one. */
  photo: string | null;
  /** The listing's illustration (emoji), shown when it has no photo. */
  emoji: string | null;
  soldOutAt: string;
  approximate: boolean;
  restockedAt: string | null;
  state: EpisodeState;
  /** Now: units sold in all, stock, price and status. Null once deleted. */
  unitsSold: number | null;
  stockNow: number | null;
  price: number | null;
  status: string | null;
}

type ListingRow = {
  id: number;
  title: string;
  seller_id: number;
  category: string | null;
  status: string;
  stock_total: number;
  sold_count: number;
  base_price: number | string;
  image: string | null;
};

/** Newest sell-out first, at most `limit` of them. */
export async function readSoldOut(db: Db, limit: number): Promise<SoldOutRow[] | null> {
  // Two events per episode at most (sold out, back in stock).
  const events = await readPaged<StockEvent>("stock events", limit * 2, (from, to) =>
    db
      .from("im_stock_events")
      .select("id, product_id, seller_id, title, kind, approximate, occurred_at")
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)
  );
  if (events === null) return null;
  const episodes = soldOutEpisodes(events).slice(0, limit);
  if (!episodes.length) return [];

  const ids = episodes.map((e) => e.productId);
  const [listings, photos] = await Promise.all([
    readIn<ListingRow>("sold-out listings", ids, (chunk) =>
      db
        .from("im_products")
        .select("id, title, seller_id, category, status, stock_total, sold_count, base_price, image")
        .in("id", chunk)
    ),
    readIn<{ product_id: number; url: string; position: number }>("sold-out photos", ids, (chunk) =>
      db.from("im_product_images").select("product_id, url, position").in("product_id", chunk).order("position")
    ),
  ]);
  const listing = new Map(listings.map((p) => [p.id, p]));
  const firstPhoto = new Map<number, string>();
  for (const ph of photos) if (!firstPhoto.has(ph.product_id)) firstPhoto.set(ph.product_id, ph.url);
  const names = await namesOf(db, episodes.map((e) => listing.get(e.productId)?.seller_id ?? e.sellerId ?? 0));

  return episodes.map((e) => {
    const p = listing.get(e.productId) ?? null;
    const sellerId = p?.seller_id ?? e.sellerId;
    return {
      eventId: e.eventId,
      productId: e.productId,
      title: p?.title ?? e.title,
      sellerId,
      sellerName: (sellerId != null && names.get(sellerId)) || (sellerId != null ? `Seller #${sellerId}` : "Unknown seller"),
      category: p?.category ?? null,
      photo: firstPhoto.get(e.productId) ?? null,
      emoji: p?.image ?? null,
      soldOutAt: e.soldOutAt,
      approximate: e.approximate,
      restockedAt: e.restockedAt,
      state: episodeState(e, p),
      unitsSold: p ? Number(p.sold_count) || 0 : null,
      stockNow: p ? Number(p.stock_total) || 0 : null,
      price: p ? Number(p.base_price) || 0 : null,
      status: p?.status ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Item history
// ---------------------------------------------------------------------------

export interface HistoryRow {
  id: number;
  productId: number;
  kind: "photo_removed" | "item_deleted";
  title: string;
  sellerId: number | null;
  sellerName: string;
  /** Photo URLs kept (Storage); inline photos from before 0023 are only counted. */
  photos: string[];
  inlinePhotos: number;
  at: string;
  /** Null: removed outside the app (the Supabase table editor). */
  byName: string | null;
  byRole: string | null;
  /** At the time it was removed. */
  price: number | null;
  stock: number | null;
  sold: number | null;
  category: string | null;
  /** A deleted listing's options, as kept. */
  options: { option: string; size: string | null; stock: number; sku: string }[];
  /** Whether the listing still exists (a photo's listing usually does). */
  listingExists: boolean;
}

type HistoryDbRow = {
  id: number;
  product_id: number;
  seller_id: number | null;
  seller_name: string | null;
  kind: "photo_removed" | "item_deleted";
  title: string;
  photos: string[] | null;
  inline_photos: number;
  base_price: number | string | null;
  category: string | null;
  stock_total: number | null;
  sold_count: number | null;
  details: { options?: HistoryRow["options"] } | null;
  actor_id: number | null;
  actor_role: string | null;
  created_at: string;
};

/** Newest first, at most `limit` rows. */
export async function readItemHistory(db: Db, limit: number): Promise<HistoryRow[] | null> {
  const rows = await readPaged<HistoryDbRow>("item history", limit, (from, to) =>
    db
      .from("im_item_history")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)
  );
  if (rows === null) return null;
  if (!rows.length) return [];

  const [names, live] = await Promise.all([
    namesOf(db, rows.flatMap((r) => [r.actor_id ?? 0, r.seller_id ?? 0])),
    readIn<{ id: number }>("history listings", rows.map((r) => r.product_id), (chunk) =>
      db.from("im_products").select("id").in("id", chunk)
    ),
  ]);
  const exists = new Set(live.map((p) => p.id));
  const num = (v: number | string | null) => (v == null ? null : Number(v));

  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    kind: r.kind,
    title: r.title,
    sellerId: r.seller_id,
    sellerName:
      (r.seller_id != null && names.get(r.seller_id)) || r.seller_name || (r.seller_id != null ? `Seller #${r.seller_id}` : "Unknown seller"),
    photos: Array.isArray(r.photos) ? r.photos : [],
    inlinePhotos: Number(r.inline_photos) || 0,
    at: r.created_at,
    byName: r.actor_id != null ? names.get(r.actor_id) || `User #${r.actor_id}` : null,
    byRole: r.actor_role,
    price: num(r.base_price),
    stock: r.stock_total,
    sold: r.sold_count,
    category: r.category,
    options: Array.isArray(r.details?.options) ? r.details.options : [],
    listingExists: exists.has(r.product_id),
  }));
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export interface SoldOutAudit {
  soldOut: SoldOutRow[] | null;
  history: HistoryRow[] | null;
  /** Listings at 0 stock that have sold at least one unit (needs no 0027). */
  soldOutNow: number;
  /** Last 30 days; null before 0027. */
  recent: { soldOut: number; restocked: number; removed: number } | null;
}

/** Rows the page shows of each list; the Excel export has up to EXPORT_LIMIT. */
export const PAGE_LIMIT = 100;
export const EXPORT_LIMIT = 5000;

export async function getSoldOutAudit(): Promise<SoldOutAudit> {
  const db = createAdminClient();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  // A GET of at most one row, not a HEAD request: a HEAD error has no body,
  // so a table this database does not have yet would read as an outage.
  const count = async (what: string, q: PromiseLike<{ count: number | null; error: Res["error"] }>) => {
    const { count: n, error } = await q;
    if (error) fail(what, error);
    return n ?? 0;
  };

  const [soldOut, history, soldOutNow] = await Promise.all([
    readSoldOut(db, PAGE_LIMIT),
    readItemHistory(db, PAGE_LIMIT),
    count(
      "sold-out count",
      db.from("im_products").select("id", { count: "exact" }).lte("stock_total", 0).gt("sold_count", 0).limit(1)
    ),
  ]);

  // Both lists read, so 0027 is there.
  const recent =
    soldOut && history
      ? await Promise.all([
          count(
            "sell-outs",
            db.from("im_stock_events").select("id", { count: "exact" }).eq("kind", "sold_out").gte("occurred_at", since).limit(1)
          ),
          count(
            "restocks",
            db.from("im_stock_events").select("id", { count: "exact" }).eq("kind", "restocked").gte("occurred_at", since).limit(1)
          ),
          count("removals", db.from("im_item_history").select("id", { count: "exact" }).gte("created_at", since).limit(1)),
        ]).then(([soldOut, restocked, removed]) => ({ soldOut, restocked, removed }))
      : null;

  return { soldOut, history, soldOutNow, recent };
}

import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingObject } from "@/lib/db-errors";
import { applyPercentOff, variantLabel } from "@/lib/pricing/core";
import {
  DataUnavailableError,
  getActiveFlashSales,
  getApprovedProducts,
  getCategories,
  getDisplayNames,
  getOrderItemsForProducts,
  getReviewsForProducts,
  getVariantsForProducts,
  popularityByProduct,
  ratingByProduct,
  stockByProduct,
} from "@/lib/data";
import { verifiedAmong } from "@/lib/pwd/data";
import {
  PAGE_SIZE,
  filterAndSort,
  matchScore,
  type ProductSuggestion,
  type SearchableItem,
  type Suggestions,
  type StorefrontItem,
  type StorefrontQuery,
} from "./storefront-core";

export type { StorefrontItem, StorefrontQuery, Suggestions, ProductSuggestion } from "./storefront-core";

/**
 * Storefront reads (home, search, shop pages, rails).
 *
 * With migrations 0016–0017 applied, everything is answered by the database:
 * im_search_products (filters, sort, typo-tolerant search, pagination) and
 * the im_storefront_products view (precomputed rating, sold count and stock,
 * the running sale, the first photo, the verified badge). Pages ask for 24
 * cards at a time instead of reading every product, variant, review and
 * order line on each request (B-16).
 *
 * Before those migrations, the same answers come from the older tables,
 * computed here. The fallback is slower but identical in shape, so the
 * pages do not care which one ran.
 */

const VIEW_COLUMNS =
  "id, seller_id, seller_name, title, category, base_price, sale_percent, sale_ends_at, effective_price, rating_avg, rating_count, sold_count, stock_total, is_featured, adaptive_tags, placeholder, thumb, created_at, seller_verified";

interface ViewRow {
  id: number;
  seller_id: number;
  seller_name: string | null;
  title: string;
  category: string | null;
  base_price: number | string;
  sale_percent: number | string | null;
  sale_ends_at: string | null;
  effective_price: number | string;
  rating_avg: number | string | null;
  rating_count: number | null;
  sold_count: number | null;
  stock_total: number | null;
  is_featured: boolean;
  adaptive_tags: string[] | null;
  placeholder: string | null;
  thumb: string | null;
  created_at: string;
  seller_verified: boolean | null;
}

function fromView(r: ViewRow): StorefrontItem {
  return {
    id: Number(r.id),
    sellerId: Number(r.seller_id),
    sellerName: r.seller_name ?? "PWD seller",
    title: r.title,
    category: r.category,
    basePrice: Number(r.base_price),
    salePercent: r.sale_percent == null ? null : Number(r.sale_percent),
    saleEndsAt: r.sale_ends_at,
    effectivePrice: Number(r.effective_price),
    ratingAvg: Number(r.rating_avg ?? 0),
    ratingCount: Number(r.rating_count ?? 0),
    soldCount: Number(r.sold_count ?? 0),
    stockTotal: Number(r.stock_total ?? 0),
    isFeatured: Boolean(r.is_featured),
    adaptiveTags: r.adaptive_tags ?? [],
    image: r.thumb ?? null,
    createdAt: r.created_at,
    sellerVerified: Boolean(r.seller_verified),
  };
}

// --- Fallback catalogue (before 0016/0017) --------------------------------------

const fallbackCatalog = cache(async (): Promise<SearchableItem[]> => {
  const products = await getApprovedProducts();
  const ids = products.map((p) => p.id);
  const [variants, reviews, orderItems, sales, names, verified] = await Promise.all([
    getVariantsForProducts(ids),
    getReviewsForProducts(ids),
    getOrderItemsForProducts(ids),
    getActiveFlashSales(),
    getDisplayNames(products.map((p) => p.seller_id)),
    verifiedAmong(products.map((p) => p.seller_id)),
  ]);
  const stock = stockByProduct(variants);
  const { avg, count } = ratingByProduct(reviews);
  const sold = popularityByProduct(orderItems);
  return products.map((p) => {
    const sale = sales[p.id];
    const salePercent = sale ? Number(sale.discount_percent) : null;
    return {
      id: p.id,
      sellerId: p.seller_id,
      sellerName: names[p.seller_id] ?? "PWD seller",
      title: p.title,
      description: p.description ?? "",
      category: p.category,
      basePrice: Number(p.base_price),
      salePercent,
      saleEndsAt: sale?.ends_at ?? null,
      effectivePrice: salePercent ? applyPercentOff(Number(p.base_price), salePercent) : Number(p.base_price),
      ratingAvg: avg[p.id] ?? 0,
      ratingCount: count[p.id] ?? 0,
      soldCount: sold[p.id] ?? 0,
      stockTotal: stock[p.id] ?? 0,
      isFeatured: Boolean(p.is_featured),
      adaptiveTags: p.adaptive_tags ?? [],
      image: p.images?.[0] ?? null,
      createdAt: p.created_at,
      sellerVerified: verified.has(p.seller_id),
    };
  });
});

/** Is the 0016/0017 storefront available? Checked once per request. */
const hasStorefrontView = cache(async (): Promise<boolean> => {
  const { error } = await createAdminClient().from("im_storefront_products").select("id").limit(1);
  if (!error) return true;
  if (isMissingObject(error)) return false;
  console.error(`[storefront] view: ${error.message}`);
  throw new DataUnavailableError("the shop");
});

export interface StorefrontPage {
  items: StorefrontItem[];
  total: number;
  /** Cards shown: pages 1..page. */
  shown: number;
  page: number;
  hasMore: boolean;
}

/** Search, filter, sort and page the catalogue. */
export async function searchStorefront(query: StorefrontQuery): Promise<StorefrontPage> {
  const page = Math.max(1, query.page ?? 1);
  const size = query.pageSize ?? PAGE_SIZE;
  const limit = page * size;

  if (await hasStorefrontView()) {
    // The function returns at most 60 rows per call; "Load more" pages past
    // that are fetched in further chunks.
    const CHUNK = 60;
    const items: StorefrontItem[] = [];
    let total = 0;
    for (let offset = 0; offset < limit; offset += CHUNK) {
      const { data, error } = await createAdminClient().rpc("im_search_products", {
        p_q: query.q ?? null,
        p_category: query.category ?? null,
        p_min: query.min ?? null,
        p_max: query.max ?? null,
        p_rating: query.rating ?? null,
        p_tags: query.tags?.length ? query.tags : null,
        p_seller: query.seller ?? null,
        p_sort: query.sort ?? (query.q ? "relevance" : "latest"),
        p_limit: Math.min(CHUNK, limit - offset),
        p_offset: offset,
        p_verified: query.verified ?? null,
      });
      if (error) {
        console.error(`[storefront] search: ${error.message}`);
        throw new DataUnavailableError("the shop");
      }
      const rows = (data ?? []) as (ViewRow & { total_count: number | string })[];
      if (rows.length) total = Number(rows[0].total_count);
      items.push(...rows.map(fromView));
      if (rows.length < Math.min(CHUNK, limit - offset)) break;
    }
    return { items, total, shown: items.length, page, hasMore: items.length < total };
  }

  const all = filterAndSort(await fallbackCatalog(), query);
  const items = all.slice(0, limit);
  return { items, total: all.length, shown: items.length, page, hasMore: items.length < all.length };
}

/** Specific listings, in the order given (rails, wishlist, recommendations). */
export async function getStorefrontItems(ids: number[]): Promise<StorefrontItem[]> {
  const wanted = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  if (!wanted.length) return [];
  let items: StorefrontItem[];
  if (await hasStorefrontView()) {
    const { data, error } = await createAdminClient().from("im_storefront_products").select(VIEW_COLUMNS).in("id", wanted);
    if (error) throw new DataUnavailableError("products");
    items = ((data ?? []) as ViewRow[]).map(fromView);
  } else {
    items = filterAndSort(await fallbackCatalog(), {}).filter((i) => wanted.includes(i.id));
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  return wanted.map((id) => byId.get(id)).filter((i): i is StorefrontItem => Boolean(i));
}

/** Featured listings that are live and in stock. */
export async function getFeaturedStorefront(limit = 10): Promise<StorefrontItem[]> {
  if (await hasStorefrontView()) {
    const { data, error } = await createAdminClient()
      .from("im_storefront_products")
      .select(VIEW_COLUMNS)
      .eq("is_featured", true)
      .gt("stock_total", 0)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new DataUnavailableError("featured products");
    return ((data ?? []) as ViewRow[]).map(fromView);
  }
  return filterAndSort(await fallbackCatalog(), {})
    .filter((i) => i.isFeatured && i.stockTotal > 0)
    .slice(0, limit);
}

/** Listings in a running flash sale, ending soonest first. */
export async function getOnSaleStorefront(limit = 10): Promise<StorefrontItem[]> {
  if (await hasStorefrontView()) {
    const { data, error } = await createAdminClient()
      .from("im_storefront_products")
      .select(VIEW_COLUMNS)
      .not("sale_percent", "is", null)
      .gt("stock_total", 0)
      .order("sale_ends_at", { ascending: true })
      .limit(limit);
    if (error) throw new DataUnavailableError("flash sales");
    return ((data ?? []) as ViewRow[]).map(fromView);
  }
  return filterAndSort(await fallbackCatalog(), {})
    .filter((i) => i.salePercent && i.stockTotal > 0)
    .sort((a, b) => Date.parse(a.saleEndsAt ?? "") - Date.parse(b.saleEndsAt ?? ""))
    .slice(0, limit);
}

/** Live listings per category, for the category chips. */
export async function getCategoryCounts(): Promise<{ total: number; byCategory: Record<string, number> }> {
  let cats: (string | null)[];
  if (await hasStorefrontView()) {
    const { data, error } = await createAdminClient().from("im_storefront_products").select("category");
    if (error) throw new DataUnavailableError("categories");
    cats = ((data ?? []) as { category: string | null }[]).map((r) => r.category);
  } else {
    cats = (await fallbackCatalog()).map((i) => i.category);
  }
  const byCategory: Record<string, number> = {};
  for (const c of cats) if (c) byCategory[c] = (byCategory[c] ?? 0) + 1;
  return { total: cats.length, byCategory };
}

// --- Search suggestions ------------------------------------------------------------

const SUGGEST_IMAGE_MAX = 40_000;

export async function suggestFromStorefront(q: string): Promise<Suggestions> {
  let products: ProductSuggestion[] = [];
  let sellerPool: { id: number; name: string }[] = [];

  if (await hasStorefrontView()) {
    const db = createAdminClient();
    const [{ data }, { data: sellers }] = await Promise.all([
      db.rpc("im_suggest_products", { p_q: q, p_limit: 6 }),
      db.from("im_storefront_products").select("seller_id, seller_name").ilike("seller_name", `%${q.replace(/[\%_]/g, (c) => "\\" + c)}%`).limit(20),
    ]);
    products = ((data ?? []) as { id: number; title: string; category: string | null; thumb: string | null; effective_price: number | string; sale_percent: number | string | null }[]).map((r) => ({
      id: Number(r.id),
      title: r.title,
      category: r.category,
      price: Number(r.effective_price),
      salePercent: r.sale_percent == null ? null : Number(r.sale_percent),
      image: r.thumb && r.thumb.length <= SUGGEST_IMAGE_MAX ? r.thumb : null,
    }));
    sellerPool = ((sellers ?? []) as { seller_id: number; seller_name: string | null }[]).map((s) => ({ id: Number(s.seller_id), name: s.seller_name ?? "" }));
  } else {
    const catalog = await fallbackCatalog();
    products = catalog
      .map((i) => ({ i, s: matchScore(q, i.title) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || b.i.soldCount - a.i.soldCount)
      .slice(0, 6)
      .map(({ i }) => ({
        id: i.id,
        title: i.title,
        category: i.category,
        price: i.effectivePrice,
        salePercent: i.salePercent,
        image: i.image && i.image.length <= SUGGEST_IMAGE_MAX ? i.image : null,
      }));
    sellerPool = catalog.map((i) => ({ id: i.sellerId, name: i.sellerName }));
  }

  const seen = new Set<number>();
  const sellers = sellerPool
    .filter((s) => s.name && matchScore(q, s.name) > 0 && !seen.has(s.id) && seen.add(s.id))
    .slice(0, 3);
  const categories = (await getCategories())
    .filter((c) => matchScore(q, `${c.label} ${c.folder ?? ""} ${c.id}`) > 0)
    .slice(0, 3)
    .map((c) => ({ id: c.id, label: c.folder || c.label }));

  return { products, categories, sellers };
}

// --- Wishlist ------------------------------------------------------------------------

export interface WishlistVariantLite {
  id: number;
  productId: number;
  label: string;
  stock: number;
}

export interface WishlistView {
  /** Listings still for sale, newest save first. */
  items: StorefrontItem[];
  /** Saved listings that were withdrawn, flagged or whose seller cannot sell. */
  unavailable: { productId: number; title: string }[];
  variants: WishlistVariantLite[];
}

export async function getWishlistView(userId: number): Promise<WishlistView> {
  const db = createAdminClient();
  const { data: saved, error } = await db
    .from("im_wishlists")
    .select("product_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new DataUnavailableError("your wishlist");
  const ids = ((saved ?? []) as { product_id: number }[]).map((r) => r.product_id);
  if (!ids.length) return { items: [], unavailable: [], variants: [] };

  const items = await getStorefrontItems(ids);
  const live = new Set(items.map((i) => i.id));
  const goneIds = ids.filter((id) => !live.has(id));
  const [gone, variants] = await Promise.all([
    goneIds.length
      ? db.from("im_products").select("id, title").in("id", goneIds)
      : Promise.resolve({ data: [] as { id: number; title: string }[] }),
    getVariantsForProducts(items.map((i) => i.id)),
  ]);
  const titles = new Map(((gone.data ?? []) as { id: number; title: string }[]).map((p) => [p.id, p.title]));
  return {
    items,
    unavailable: goneIds.map((id) => ({ productId: id, title: titles.get(id) ?? "A product" })),
    variants: variants.map((v) => ({
      id: v.id,
      productId: v.product_id,
      label: variantLabel(v.color_name, v.size),
      stock: v.stock_qty,
    })),
  };
}

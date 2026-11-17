/**
 * Storefront rules shared by the database path and the in-app fallback:
 * the sort keys, the query shape, and — for the fallback — filtering,
 * typo-tolerant matching and ordering. Pure, so it is unit-tested and safe
 * to import in client components (sort tabs, filter panel).
 */

export const SORTS = [
  { key: "relevance", label: "Relevance" },
  { key: "latest", label: "Latest" },
  { key: "top_sales", label: "Top sales" },
  { key: "price_asc", label: "Price: low to high" },
  { key: "price_desc", label: "Price: high to low" },
] as const;

export type SortKey = (typeof SORTS)[number]["key"];

export const PAGE_SIZE = 24;
export const MAX_PAGES = 10;

/** Tags a product can carry (0016 check constraint; client Q14). */
export const ADAPTIVE_TAGS = [
  { key: "one_handed", label: "One-handed use" },
  { key: "braille_large_print", label: "Braille or large print" },
  { key: "sensory_friendly", label: "Sensory-friendly" },
  { key: "seated_fit", label: "Seated fit" },
  { key: "easy_grip", label: "Easy grip" },
  { key: "easy_closure", label: "Easy closures" },
] as const;

export type AdaptiveTag = (typeof ADAPTIVE_TAGS)[number]["key"];

export interface StorefrontQuery {
  q?: string;
  category?: string;
  min?: number;
  max?: number;
  rating?: number;
  tags?: AdaptiveTag[];
  seller?: number;
  verified?: boolean;
  sort?: SortKey;
  /** 1-based; the page shows pages 1..page (a "Load more" list). */
  page?: number;
  pageSize?: number;
}

/** One listing as every storefront surface shows it. Public data only. */
export interface StorefrontItem {
  id: number;
  sellerId: number;
  sellerName: string;
  title: string;
  category: string | null;
  basePrice: number;
  salePercent: number | null;
  saleEndsAt: string | null;
  effectivePrice: number;
  ratingAvg: number;
  ratingCount: number;
  soldCount: number;
  stockTotal: number;
  isFeatured: boolean;
  adaptiveTags: string[];
  image: string | null;
  createdAt: string;
  sellerVerified: boolean;
}

/** Fallback-only extra: text to match against. */
export interface SearchableItem extends StorefrontItem {
  description: string;
}

function clampInt(n: unknown, lo: number, hi: number, dflt: number): number {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
}

/** Read the storefront query from URL search params. Never trusts them. */
export function parseStorefrontParams(sp: Record<string, string | string[] | undefined>): StorefrontQuery {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const many = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v : v ? String(v).split(",") : []).map((s) => s.trim()).filter(Boolean);
  };
  const num = (k: string) => {
    const s = one(k);
    if (s === "") return undefined;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const sortRaw = one("sort");
  const q = one("q").trim().slice(0, 100);
  const sort = (SORTS.some((s) => s.key === sortRaw) ? sortRaw : q ? "relevance" : "latest") as SortKey;
  const tags = many("tags").filter((t): t is AdaptiveTag => ADAPTIVE_TAGS.some((a) => a.key === t));
  const rating = num("rating");
  const seller = num("seller");
  return {
    q: q || undefined,
    category: one("cat").slice(0, 40) || undefined,
    min: num("min"),
    max: num("max"),
    rating: rating && rating >= 1 && rating <= 5 ? rating : undefined,
    tags: tags.length ? tags : undefined,
    seller: seller && Number.isInteger(seller) ? seller : undefined,
    verified: one("verified") === "1" ? true : undefined,
    sort,
    page: clampInt(one("page") || 1, 1, MAX_PAGES, 1),
  };
}

/** The same query back as URL params (for links: sort tabs, load more). */
export function storefrontParams(q: StorefrontQuery, overrides: Partial<StorefrontQuery> = {}): URLSearchParams {
  const m = { ...q, ...overrides };
  const p = new URLSearchParams();
  if (m.q) p.set("q", m.q);
  if (m.category) p.set("cat", m.category);
  if (m.min !== undefined) p.set("min", String(m.min));
  if (m.max !== undefined) p.set("max", String(m.max));
  if (m.rating) p.set("rating", String(m.rating));
  if (m.tags?.length) p.set("tags", m.tags.join(","));
  if (m.seller) p.set("seller", String(m.seller));
  if (m.verified) p.set("verified", "1");
  const defaultSort = m.q ? "relevance" : "latest";
  if (m.sort && m.sort !== defaultSort) p.set("sort", m.sort);
  if (m.page && m.page > 1) p.set("page", String(m.page));
  return p;
}

// --- Fallback matching ---------------------------------------------------------

/**
 * Edit distance where swapping two neighbouring letters counts as one typo
 * (optimal string alignment) — "tabel" is one slip from "table", not two.
 * Gives up early once the distance passes `cap`.
 */
export function levenshtein(a: string, b: string, cap = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      }
      best = Math.min(best, cur[j]);
    }
    if (best > cap) return cap + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

/**
 * 0 when the text does not match; higher is better. Every query word must
 * match a word of the text: exactly or as a prefix (strong), inside a word,
 * or within one typo (two for long words) — "bayng" still finds "bayong".
 */
export function matchScore(query: string, title: string, description = ""): number {
  const qw = words(query);
  if (!qw.length) return 0;
  const tw = words(title);
  const dw = words(description);
  let score = 0;
  for (const w of qw) {
    let best = 0;
    for (const [list, weight] of [[tw, 3], [dw, 1]] as const) {
      for (const t of list) {
        let s = 0;
        if (t === w || t.startsWith(w)) s = 3;
        else if (w.length >= 3 && t.includes(w)) s = 2;
        else if (w.length >= 4 && levenshtein(w, t, 2) <= (w.length >= 7 ? 2 : 1)) s = 1.5;
        best = Math.max(best, s * weight);
      }
    }
    if (best === 0) return 0;
    score += best;
  }
  return score;
}

export function filterAndSort(items: SearchableItem[], q: StorefrontQuery): StorefrontItem[] {
  const text = q.q?.trim() ?? "";
  const scored: { item: SearchableItem; rank: number }[] = [];
  for (const item of items) {
    const rank = text ? matchScore(text, item.title, item.description) : 0;
    if (text && rank === 0) continue;
    if (q.category && item.category !== q.category) continue;
    if (q.min !== undefined && item.effectivePrice < q.min) continue;
    if (q.max !== undefined && item.effectivePrice > q.max) continue;
    if (q.rating && item.ratingAvg < q.rating) continue;
    if (q.tags?.length && !q.tags.every((t) => item.adaptiveTags.includes(t))) continue;
    if (q.seller && item.sellerId !== q.seller) continue;
    if (q.verified && !item.sellerVerified) continue;
    scored.push({ item, rank });
  }
  const latest = (a: StorefrontItem, b: StorefrontItem) =>
    Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id;
  const by: Record<SortKey, (a: { item: SearchableItem; rank: number }, b: { item: SearchableItem; rank: number }) => number> = {
    relevance: (a, b) => b.rank - a.rank || latest(a.item, b.item),
    latest: (a, b) => latest(a.item, b.item),
    top_sales: (a, b) => b.item.soldCount - a.item.soldCount || latest(a.item, b.item),
    price_asc: (a, b) => a.item.effectivePrice - b.item.effectivePrice || latest(a.item, b.item),
    price_desc: (a, b) => b.item.effectivePrice - a.item.effectivePrice || latest(a.item, b.item),
  };
  scored.sort(by[q.sort ?? (text ? "relevance" : "latest")]);
  // Strip the search-only field so descriptions never ride along to a client.
  return scored.map(({ item }) => {
    const { description: _drop, ...rest } = item;
    void _drop;
    return rest;
  });
}

// --- Home rails and the hero side tile (05 #3, #8) ---------------------------------

/** A category as a home rail names it: the name the chips show, its icon. */
export interface RailCategory {
  id: string;
  label: string;
  icon?: string;
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The `n` categories with the most live products, most first: the "Best
 * sellers in …" rails. A tie goes to the label, A→Z, compared case-
 * insensitively by code point so the order does not depend on the server's
 * locale (then the id, so it is always total). Only categories in
 * `categories` (the open ones) can be picked; one with no live products is
 * left out, so there may be fewer than `n`.
 */
export function topCategories(
  byCategory: Record<string, number>,
  categories: readonly { id: string; label: string }[],
  n = 2
): string[] {
  const take = Math.max(0, Math.floor(n));
  if (!take) return [];
  const seen = new Set<string>();
  return categories
    .filter((c) => !seen.has(c.id) && seen.add(c.id))
    .map((c) => ({
      id: c.id,
      label: c.label.toLowerCase(),
      count: Object.prototype.hasOwnProperty.call(byCategory, c.id) ? Number(byCategory[c.id]) : 0,
    }))
    .filter((c) => Number.isFinite(c.count) && c.count > 0)
    .sort((a, b) => b.count - a.count || byText(a.label, b.label) || byText(a.id, b.id))
    .slice(0, take)
    .map((c) => c.id);
}

/** The hero's side tile: the live flash sale, else a featured shop, else none. */
export type HeroPromo<Shop> =
  | { kind: "flash"; item: StorefrontItem; endsAt: string }
  | { kind: "shop"; shop: Shop }
  | null;

/**
 * Pick the hero's side tile from reads the page already makes (05 #3):
 * `onSale` is getOnSaleStorefront's list (ending soonest first), so the
 * first listing whose sale has not ended is the live flash sale; otherwise
 * the first featured shop; otherwise null, and the page hides the tile.
 */
export function heroPromo<Shop>(
  onSale: readonly StorefrontItem[],
  shops: readonly Shop[],
  now: number = Date.now()
): HeroPromo<Shop> {
  for (const item of onSale) {
    // An unparsable or missing end is NaN, which is never in the future.
    if (item.saleEndsAt && Date.parse(item.saleEndsAt) > now) return { kind: "flash", item, endsAt: item.saleEndsAt };
  }
  return shops.length ? { kind: "shop", shop: shops[0] } : null;
}

/**
 * How the hero lays out (05 #3, plan Q4), from what it has to show:
 *   "split"    banners and a promo: the carousel 2/3 and the tile 1/3 from
 *              1024px, stacked (carousel first) below that;
 *   "carousel" banners only: the carousel full width;
 *   "promo"    a promo only: the tile full width, as a wide card;
 *   "none"     neither: no section at all (no empty box, no heading).
 * One banner is still a carousel layout; RailScroller drops its controls.
 */
export type HeroLayout = "split" | "carousel" | "promo" | "none";

export function heroLayout(bannerCount: number, promo: HeroPromo<unknown>): HeroLayout {
  const banners = bannerCount > 0;
  if (banners) return promo ? "split" : "carousel";
  return promo ? "promo" : "none";
}

// --- Search suggestions (header search box) --------------------------------------

export interface ProductSuggestion {
  id: number;
  title: string;
  category: string | null;
  price: number;
  salePercent: number | null;
  /** Small images only; a large inline photo would make every keystroke heavy. */
  image: string | null;
}

export interface Suggestions {
  products: ProductSuggestion[];
  categories: { id: string; label: string }[];
  sellers: { id: number; name: string }[];
}

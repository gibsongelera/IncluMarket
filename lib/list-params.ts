/**
 * The URL state of an admin list (ADR-05, 03 §6): the page, the page size,
 * the search text, the list's own filter (?status, ?view or ?role) and
 * ?focus=, read from a page's searchParams and written back into links.
 * Search is a plain GET form and pagination plain links, so a list works
 * without JavaScript and every state has a URL.
 *
 * The search text reaches PostgREST inside an or() filter, where `,` `(` `)`
 * are its grammar, `"` quotes a value and `*` is a wildcard; LIKE adds `%`
 * `_` and `\`. searchPattern() strips the first group and escapes the
 * second, so typed text can only ever match itself.
 *
 * Pure, with no runtime imports: tests import this file by its .ts path.
 */

/** The page sizes a list offers (03 §6). */
export const PER_PAGE = [10, 25, 50] as const;
export type PerPage = (typeof PER_PAGE)[number];
export const DEFAULT_PER_PAGE: PerPage = 25;
/** The longest search text kept, in characters. */
export const SEARCH_MAX = 80;
/** The highest page number accepted; a larger one is clamped (no list here is that long). */
export const PAGE_MAX = 10_000;
/** The filters a list carries from link to link. */
export const KEPT_PARAMS = ["status", "view", "role"] as const;
export type KeptParam = (typeof KEPT_PARAMS)[number];

/** A page's searchParams as Next passes them. */
export type RawParams = Record<string, string | string[] | undefined>;

export interface ListParams {
  /** 1 or more. */
  page: number;
  perPage: PerPage;
  /** The search text as typed, tidied: one space between words, at most SEARCH_MAX characters; "" for none. */
  q: string;
  /** The list's own filters, as given (each list checks its values against its own tabs). */
  filters: Partial<Record<KeptParam, string>>;
  /** ?focus=<id>: the row to open the list at; null when absent or not an id. */
  focus: number | null;
}

/** The first value of a query parameter. */
function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** A positive whole number written plainly ("12"), or null ("1e3", "-2", "3.5", "0x10" are not). */
function plainId(text: string): number | null {
  if (!/^\d{1,15}$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Search text tidied for display and the form: control characters dropped, spaces collapsed, capped at SEARCH_MAX characters. */
export function cleanSearch(text: string): string {
  const words = text
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(words).slice(0, SEARCH_MAX).join("").trim();
}

export function parseListParams(raw: RawParams): ListParams {
  const page = plainId(first(raw.page).trim());
  const per = Number(first(raw.per));
  const filters: Partial<Record<KeptParam, string>> = {};
  for (const key of KEPT_PARAMS) {
    const v = first(raw[key]).trim();
    if (v && v.length <= 40) filters[key] = v;
  }
  return {
    page: Math.min(page ?? 1, PAGE_MAX),
    perPage: (PER_PAGE as readonly number[]).includes(per) ? (per as PerPage) : DEFAULT_PER_PAGE,
    q: cleanSearch(first(raw.q)),
    filters,
    focus: plainId(first(raw.focus).trim()),
  };
}

/**
 * The search text as an ilike pattern that is safe inside PostgREST's or():
 * its grammar characters (`,` `(` `)` `"`) and its wildcard `*` are removed,
 * LIKE's `\` `%` `_` are escaped, and the rest is wrapped in `%…%` so it
 * matches anywhere. null when nothing searchable is left.
 */
export function searchPattern(q: string): string | null {
  const kept = cleanSearch(q.replace(/[,()"*]/g, " "));
  if (!kept) return null;
  return `%${kept.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** An order or record number in the search text ("123" or "#123"), for an exact id match beside the text search. */
export function searchId(q: string): number | null {
  return plainId(q.trim().replace(/^#/, ""));
}

/** The rows of one page for PostgREST's .range(from, to), both ends included. */
export function pageRange(page: number, perPage: number): { from: number; to: number } {
  const from = (Math.max(1, Math.floor(page)) - 1) * perPage;
  return { from, to: from + perPage - 1 };
}

/** How many pages `total` rows fill; at least 1, so an empty list still has its page 1. */
export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / perPage));
}

/** The page that holds the row at `index` (0-based) of the sorted list. */
export function pageOf(index: number, perPage: number): number {
  return Math.floor(Math.max(0, index) / perPage) + 1;
}

/**
 * The page numbers a pager shows, with null for a gap ("…"): the first and
 * last pages and the current one with its neighbours, as in 1 … 4 5 6 … 20.
 * A gap that would hide a single page shows that page instead, so a gap
 * always stands for two or more. At most seven items.
 */
export function pageItems(current: number, pages: number): (number | null)[] {
  const last = Math.max(1, Math.floor(pages));
  const at = Math.min(Math.max(1, Math.floor(current)), last);
  const keep = [...new Set([1, at - 1, at, at + 1, last])]
    .filter((p) => p >= 1 && p <= last)
    .sort((a, b) => a - b);
  const items: (number | null)[] = [];
  let prev = 0;
  for (const p of keep) {
    if (p - prev === 2) items.push(prev + 1);
    else if (p - prev > 2) items.push(null);
    items.push(p);
    prev = p;
  }
  return items;
}

/**
 * A link to the same list with some state changed: the kept filters, the
 * search text and the page size carry over; defaults (page 1, 25 per page,
 * no search) are left out so URLs stay short. `null` removes a value.
 */
export function listHref(
  path: string,
  params: ListParams,
  changes: { [K in "page" | "perPage" | "q" | "focus" | KeptParam]?: string | number | null } = {}
): string {
  const state: Record<string, string | number | null | undefined> = {
    ...params.filters,
    q: params.q,
    per: params.perPage,
    page: params.page,
  };
  for (const [key, value] of Object.entries(changes)) {
    const name = key === "perPage" ? "per" : key;
    state[name] = value;
    // A new filter, search or page size starts again at page 1.
    if (name !== "page" && name !== "focus" && !("page" in changes)) state.page = 1;
  }
  const query = new URLSearchParams();
  for (const key of [...KEPT_PARAMS, "q", "per", "page", "focus"]) {
    const v = state[key];
    if (v === null || v === undefined || v === "") continue;
    if (key === "per" && Number(v) === DEFAULT_PER_PAGE) continue;
    if (key === "page" && Number(v) <= 1) continue;
    query.set(key, String(v));
  }
  const s = query.toString();
  return s ? `${path}?${s}` : path;
}

/**
 * The second sentence of a list's "#<id> is not in this list" note, the way
 * to the missing record: " Try the All tab.", " Try clearing the search.",
 * both, or "" when the list is already the widest tab with no search.
 */
export function missingHint(otherTab: boolean, searched: boolean, widest: string): string {
  if (otherTab && searched) return ` Try the ${widest} tab or clear the search.`;
  if (otherTab) return ` Try the ${widest} tab.`;
  if (searched) return " Try clearing the search.";
  return "";
}

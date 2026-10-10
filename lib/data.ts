import "server-only";
import { createAdminClient } from "./supabase/admin";
import { sellersWhoCanSell } from "./catalog";
import type { AddressLite } from "./address";
import type {
  AuditLog,
  Category,
  ConsentLog,
  Conversation,
  FlashSale,
  Message,
  Notification,
  Order,
  OrderItem,
  OrderStatusHistoryEntry,
  Product,
  ProductReview,
  ProductVariant,
  Profile,
  SupportTicket,
  ThemeSettings,
  TicketResponse,
} from "./types";

// Server-side read layer. Uses the service-role admin client (server-only);
// pages perform their own role checks via requireRole(), and RLS is retained
// as defence-in-depth for any direct/anon access.
//
// Every read checks `error`. These functions used to destructure only `data`
// and fall back to `[]`, so when the database became unreachable the
// storefront rendered "0 results" with HTTP 200 — an outage indistinguishable
// from an empty shop. A failed read now throws DataUnavailableError, which the
// nearest app/**/error.tsx boundary renders as a real error state.

const db = () => createAdminClient();

export class DataUnavailableError extends Error {
  constructor(what: string) {
    super(`Could not load ${what}.`);
    this.name = "DataUnavailableError";
  }
}

type Res = { data: unknown; error: { message: string } | null };

function fail(what: string, error: { message: string }): never {
  console.error(`[data] ${what}: ${error.message}`);
  throw new DataUnavailableError(what);
}

/** A list read: throws on error, `[]` when there are no rows. */
function rows<T>(what: string, res: Res): T[] {
  if (res.error) fail(what, res.error);
  return (res.data as T[] | null) ?? [];
}

/** A single-row read: throws on error, `null` when the row does not exist. */
function one<T>(what: string, res: Res): T | null {
  if (res.error) fail(what, res.error);
  return (res.data as T | null) ?? null;
}

// Product photos live in im_product_images (url + position). Hydrate the
// product.images array so cards/detail/cart can show uploaded photos, falling
// back to the emoji placeholder when none exist.
async function imagesByProduct(productIds: number[]): Promise<Record<number, string[]>> {
  const map: Record<number, string[]> = {};
  if (!productIds.length) return map;
  const data = rows<{ product_id: number; url: string }>(
    "product images",
    await db()
      .from("im_product_images")
      .select("product_id,url,position")
      .in("product_id", productIds)
      .order("position")
  );
  data.forEach((row) => {
    (map[row.product_id] ||= []).push(row.url);
  });
  return map;
}

async function hydrateImages(products: Product[]): Promise<Product[]> {
  const map = await imagesByProduct(products.map((p) => p.id));
  return products.map((p) => ({ ...p, images: map[p.id] ?? [] }));
}

// Only sellers who may sell (active, and verified or in their grace period)
// appear publicly — the rule lives in lib/catalog.ts and is shared with the
// cart, checkout, wishlist, reviews and the pricing engine.
async function publicOnly(products: Product[]): Promise<Product[]> {
  if (!products.length) return products;
  let sellable: Set<number>;
  try {
    sellable = await sellersWhoCanSell(db(), products.map((p) => p.seller_id));
  } catch (e) {
    console.error("[data] seller status:", (e as Error).message);
    throw new DataUnavailableError("seller status");
  }
  return products.filter((p) => sellable.has(p.seller_id));
}

export async function getCategories(): Promise<Category[]> {
  return rows<Category>("categories", await db().from("im_categories").select("*").order("label"));
}

export async function getApprovedProducts(): Promise<Product[]> {
  const data = rows<Product>(
    "products",
    await db()
      .from("im_products")
      .select("*")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
  );
  return hydrateImages(await publicOnly(data));
}

export async function getAllProducts(): Promise<Product[]> {
  const data = rows<Product>(
    "products",
    await db().from("im_products").select("*").order("created_at", { ascending: false })
  );
  return hydrateImages(data);
}

export async function getProductsBySeller(sellerId: number): Promise<Product[]> {
  const data = rows<Product>(
    "seller products",
    await db()
      .from("im_products")
      .select("*")
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false })
  );
  return hydrateImages(data);
}

/** Any product regardless of status. Owner/admin views only — never public. */
export async function getProductById(id: number): Promise<Product | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const data = one<Product>(
    "product",
    await db().from("im_products").select("*").eq("id", id).maybeSingle()
  );
  if (!data) return null;
  return (await hydrateImages([data]))[0];
}

/**
 * A product as the public may see it: approved, from an active seller.
 * Returns null otherwise, so a pending or flagged listing 404s for guests and
 * buyers instead of rendering (and being purchasable) by URL.
 */
export async function getPublicProductById(id: number): Promise<Product | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const data = one<Product>(
    "product",
    await db().from("im_products").select("*").eq("id", id).eq("status", "approved").maybeSingle()
  );
  if (!data) return null;
  const [visible] = await publicOnly([data]);
  if (!visible) return null;
  return (await hydrateImages([visible]))[0];
}

export async function getFeaturedProducts(limit = 8): Promise<Product[]> {
  const data = rows<Product>(
    "featured products",
    await db()
      .from("im_products")
      .select("*")
      .eq("status", "approved")
      .eq("is_featured", true)
      .order("updated_at", { ascending: false })
      .limit(limit)
  );
  return hydrateImages(await publicOnly(data));
}

// "Customers also viewed" — same category, excludes the current product.
export async function getRelatedProducts(
  category: string | null,
  excludeId: number,
  limit = 6
): Promise<Product[]> {
  if (!category) return [];
  const data = rows<Product>(
    "related products",
    await db()
      .from("im_products")
      .select("*")
      .eq("status", "approved")
      .eq("category", category)
      .neq("id", excludeId)
      .order("created_at", { ascending: false })
      .limit(limit)
  );
  return hydrateImages(await publicOnly(data));
}

export async function getVerifiedBuyerIds(productId: number): Promise<Set<number>> {
  const items = rows<{ order_id: number }>(
    "order items",
    await db().from("im_order_items").select("order_id").eq("product_id", productId)
  );
  const orderIds = [...new Set(items.map((i) => i.order_id))];
  if (!orderIds.length) return new Set();

  const orders = rows<{ buyer_id: number }>(
    "orders",
    await db().from("im_orders").select("buyer_id").in("id", orderIds)
  );
  return new Set(orders.map((o) => o.buyer_id));
}

export async function getVariants(): Promise<ProductVariant[]> {
  return rows<ProductVariant>(
    "variants",
    await db().from("im_product_variants").select("*").order("id")
  );
}

export async function getVariantsByProduct(productId: number): Promise<ProductVariant[]> {
  return rows<ProductVariant>(
    "variants",
    await db().from("im_product_variants").select("*").eq("product_id", productId).order("id")
  );
}

export async function getReviews(): Promise<ProductReview[]> {
  return rows<ProductReview>(
    "reviews",
    await db().from("im_product_reviews").select("*").order("created_at", { ascending: false })
  );
}

export async function getReviewsByProduct(productId: number): Promise<ProductReview[]> {
  return rows<ProductReview>(
    "reviews",
    await db()
      .from("im_product_reviews")
      .select("*")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
  );
}

export async function getProfiles(): Promise<Profile[]> {
  return rows<Profile>("profiles", await db().from("im_profiles").select("*").order("id"));
}

export async function getProfileById(id: number): Promise<Profile | null> {
  return one<Profile>(
    "profile",
    await db().from("im_profiles").select("*").eq("id", id).maybeSingle()
  );
}

export async function getFeaturedSellers(): Promise<Profile[]> {
  return rows<Profile>(
    "featured sellers",
    await db()
      .from("im_profiles")
      .select("*")
      .eq("role", "seller")
      .eq("account_status", "active")
      .eq("is_featured_seller", true)
      .order("name")
  );
}

/**
 * Display names for a known set of profile ids — the scoped alternative to
 * getProfiles(), which returns every user's full row. Pages that only need to
 * print "who" must use this so no other column is ever read for them.
 */
export async function getDisplayNames(ids: number[]): Promise<Record<number, string>> {
  const unique = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  if (!unique.length) return {};
  const data = rows<{ id: number; name: string }>(
    "names",
    await db().from("im_profiles").select("id, name").in("id", unique)
  );
  return Object.fromEntries(data.map((r) => [r.id, r.name]));
}

export async function getProfileByEmail(email: string): Promise<Profile | null> {
  return one<Profile>(
    "profile",
    await db().from("im_profiles").select("*").ilike("email", email).maybeSingle()
  );
}

export async function getOrders(): Promise<Order[]> {
  return rows<Order>(
    "orders",
    await db().from("im_orders").select("*").order("created_at", { ascending: false })
  );
}

/** One of this buyer's orders, or null (never another buyer's). */
export async function getBuyerOrder(buyerId: number, orderId: number): Promise<Order | null> {
  if (!Number.isInteger(orderId) || orderId <= 0) return null;
  return one<Order>(
    "order",
    await db().from("im_orders").select("*").eq("id", orderId).eq("buyer_id", buyerId).maybeSingle()
  );
}

export async function getOrdersByBuyer(buyerId: number): Promise<Order[]> {
  return rows<Order>(
    "orders",
    await db()
      .from("im_orders")
      .select("*")
      .eq("buyer_id", buyerId)
      .order("created_at", { ascending: false })
  );
}

export async function getOrderItems(): Promise<OrderItem[]> {
  return rows<OrderItem>("order items", await db().from("im_order_items").select("*").order("id"));
}

export async function getOrderStatusHistoryForOrders(
  orderIds: number[]
): Promise<Record<number, OrderStatusHistoryEntry[]>> {
  const map: Record<number, OrderStatusHistoryEntry[]> = {};
  if (!orderIds.length) return map;
  const data = rows<OrderStatusHistoryEntry>(
    "order history",
    await db()
      .from("im_order_status_history")
      .select("*")
      .in("order_id", orderIds)
      .order("created_at", { ascending: true })
  );
  data.forEach((row) => {
    (map[row.order_id] ||= []).push(row);
  });
  return map;
}

// Active flash sales (now within [starts_at, ends_at]) keyed by product id.
export async function getActiveFlashSales(): Promise<Record<number, FlashSale>> {
  const nowIso = new Date().toISOString();
  const data = rows<FlashSale>(
    "flash sales",
    await db().from("im_flash_sales").select("*").lte("starts_at", nowIso).gte("ends_at", nowIso)
  );
  const map: Record<number, FlashSale> = {};
  data.forEach((f) => (map[f.product_id] = f));
  return map;
}

/** The flash sale running on one product right now, if any. */
export async function getActiveSaleForProduct(productId: number): Promise<FlashSale | null> {
  const nowIso = new Date().toISOString();
  const data = rows<FlashSale>(
    "flash sale",
    await db()
      .from("im_flash_sales")
      .select("*")
      .eq("product_id", productId)
      .lte("starts_at", nowIso)
      .gte("ends_at", nowIso)
      .order("starts_at", { ascending: false })
      .limit(1)
  );
  return data[0] ?? null;
}

export async function getConversationsForUser(
  userId: number,
  role: "buyer" | "seller"
): Promise<Conversation[]> {
  const col = role === "buyer" ? "buyer_id" : "seller_id";
  return rows<Conversation>(
    "conversations",
    await db()
      .from("im_conversations")
      .select("*")
      .eq(col, userId)
      .order("updated_at", { ascending: false })
  );
}

export async function getMessagesForConversations(
  conversationIds: number[]
): Promise<Record<number, Message[]>> {
  const map: Record<number, Message[]> = {};
  if (!conversationIds.length) return map;
  const data = rows<Message>(
    "messages",
    await db()
      .from("im_messages")
      .select("*")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: true })
  );
  data.forEach((m) => {
    (map[m.conversation_id] ||= []).push(m);
  });
  return map;
}

export async function getTickets(): Promise<SupportTicket[]> {
  return rows<SupportTicket>(
    "tickets",
    await db().from("im_support_tickets").select("*").order("created_at", { ascending: false })
  );
}

export async function getTicketsForUser(userId: number): Promise<SupportTicket[]> {
  return rows<SupportTicket>(
    "tickets",
    await db()
      .from("im_support_tickets")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
  );
}

export async function getTicketResponses(): Promise<TicketResponse[]> {
  return rows<TicketResponse>(
    "ticket responses",
    await db().from("im_ticket_responses").select("*").order("created_at")
  );
}

export async function getConsentLogs(): Promise<ConsentLog[]> {
  return rows<ConsentLog>(
    "consent logs",
    await db().from("im_consent_logs").select("*").order("created_at", { ascending: false })
  );
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  return rows<AuditLog>(
    "audit logs",
    await db().from("im_audit_logs").select("*").order("created_at", { ascending: false })
  );
}

export async function getThemeSettings(): Promise<ThemeSettings | null> {
  // Deliberately soft-fails: the theme is read by the ROOT layout, so throwing
  // here would take down every page including the error page itself. Missing
  // env at build time (Vercel before env is wired) and an unreachable database
  // both fall back to the default preset.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return null;
  }
  try {
    const { data, error } = await db()
      .from("im_theme_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}

export async function getWishlistProductIds(userId: number): Promise<number[]> {
  const data = rows<{ product_id: number }>(
    "wishlist",
    await db().from("im_wishlists").select("product_id").eq("user_id", userId)
  );
  return data.map((r) => r.product_id);
}

/** Saved items, for the header badge. */
export async function getWishlistCount(userId: number): Promise<number> {
  const { count, error } = await db()
    .from("im_wishlists")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return error ? 0 : count ?? 0;
}

// ---- scoped readers ----------------------------------------------------------
// The unscoped readers above (getProfiles, getAllProducts, getOrders,
// getOrderItems, getReviews, getVariants, getTicketResponses) return whole
// tables and are for admin pages only — scripts/check-page-props.mjs fails the
// build if any other page imports them. Everything below reads only the rows a
// page is about.

/** Lightweight product rows for listing lines: title plus first photo. */
export interface ProductThumb {
  id: number;
  title: string;
  image: string | null;
  images: string[];
  seller_id: number;
}

export async function getProductThumbs(ids: number[]): Promise<ProductThumb[]> {
  const unique = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  if (!unique.length) return [];
  const products = rows<{ id: number; title: string; image: string | null; seller_id: number }>(
    "products",
    await db().from("im_products").select("id, title, image, seller_id").in("id", unique)
  );
  const imgs = rows<{ product_id: number; url: string }>(
    "product images",
    await db()
      .from("im_product_images")
      .select("product_id, url")
      .in("product_id", unique)
      .eq("position", 0)
  );
  const first = new Map(imgs.map((i) => [i.product_id, i.url]));
  return products.map((p) => ({ ...p, images: first.has(p.id) ? [first.get(p.id)!] : [] }));
}

/** A seller's own products, id/title/status only — no photos, no prices. */
export async function getSellerProductIndex(
  sellerId: number
): Promise<{ id: number; title: string; status: string }[]> {
  return rows<{ id: number; title: string; status: string }>(
    "seller products",
    await db().from("im_products").select("id, title, status").eq("seller_id", sellerId)
  );
}

export async function getVariantsByIds(ids: number[]): Promise<ProductVariant[]> {
  const unique = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  if (!unique.length) return [];
  return rows<ProductVariant>(
    "variants",
    await db().from("im_product_variants").select("*").in("id", unique)
  );
}

export async function getVariantsForProducts(productIds: number[]): Promise<ProductVariant[]> {
  const unique = [...new Set(productIds)];
  if (!unique.length) return [];
  return rows<ProductVariant>(
    "variants",
    await db().from("im_product_variants").select("*").in("product_id", unique).order("id")
  );
}

export async function getOrderItemsForOrders(orderIds: number[]): Promise<OrderItem[]> {
  const unique = [...new Set(orderIds)];
  if (!unique.length) return [];
  return rows<OrderItem>(
    "order items",
    await db().from("im_order_items").select("*").in("order_id", unique).order("id")
  );
}

export async function getOrderItemsForProducts(productIds: number[]): Promise<OrderItem[]> {
  const unique = [...new Set(productIds)];
  if (!unique.length) return [];
  return rows<OrderItem>(
    "order items",
    await db().from("im_order_items").select("*").in("product_id", unique).order("id")
  );
}

export async function getOrdersByIds(ids: number[]): Promise<Order[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  return rows<Order>(
    "orders",
    await db().from("im_orders").select("*").in("id", unique).order("created_at", { ascending: false })
  );
}

export async function getReviewsForProducts(productIds: number[]): Promise<ProductReview[]> {
  const unique = [...new Set(productIds)];
  if (!unique.length) return [];
  return rows<ProductReview>(
    "reviews",
    await db()
      .from("im_product_reviews")
      .select("*")
      .in("product_id", unique)
      .order("created_at", { ascending: false })
  );
}

export async function getReviewedProductIds(buyerId: number): Promise<number[]> {
  const data = rows<{ product_id: number }>(
    "reviews",
    await db().from("im_product_reviews").select("product_id").eq("buyer_id", buyerId)
  );
  return data.map((r) => r.product_id);
}

export async function getTicketResponsesForTickets(ticketIds: number[]): Promise<TicketResponse[]> {
  const unique = [...new Set(ticketIds)];
  if (!unique.length) return [];
  return rows<TicketResponse>(
    "ticket responses",
    await db().from("im_ticket_responses").select("*").in("ticket_id", unique).order("created_at")
  );
}

// ---- aggregation helpers ---------------------------------------------------
export function stockByProduct(variants: ProductVariant[]): Record<number, number> {
  const map: Record<number, number> = {};
  for (const v of variants) map[v.product_id] = (map[v.product_id] || 0) + v.stock_qty;
  return map;
}

export function popularityByProduct(orderItems: OrderItem[]): Record<number, number> {
  const map: Record<number, number> = {};
  for (const oi of orderItems) {
    if (oi.product_id == null) continue;
    map[oi.product_id] = (map[oi.product_id] || 0) + oi.quantity;
  }
  return map;
}

export function ratingByProduct(reviews: ProductReview[]): {
  avg: Record<number, number>;
  count: Record<number, number>;
} {
  const sum: Record<number, number> = {};
  const count: Record<number, number> = {};
  for (const r of reviews) {
    sum[r.product_id] = (sum[r.product_id] || 0) + r.rating_score;
    count[r.product_id] = (count[r.product_id] || 0) + 1;
  }
  const avg: Record<number, number> = {};
  for (const pid of Object.keys(sum)) {
    const id = Number(pid);
    avg[id] = sum[id] / count[id];
  }
  return { avg, count };
}

/** Account → Personalised recommendations (0019). Off when unavailable. */
export async function getPersonalizationSetting(profileId: number): Promise<{ available: boolean; enabled: boolean }> {
  const { data, error } = await db()
    .from("im_profiles")
    .select("personalization_opt_out")
    .eq("id", profileId)
    .maybeSingle();
  if (error) return { available: false, enabled: false };
  return { available: true, enabled: !(data as { personalization_opt_out?: boolean } | null)?.personalization_opt_out };
}

/** Notification settings per type (0019); null before the table exists. */
export async function getNotificationPrefs(
  profileId: number
): Promise<Record<string, { in_app: boolean; email: boolean }> | null> {
  const { data, error } = await db()
    .from("im_notification_prefs")
    .select("type, in_app, email")
    .eq("profile_id", profileId);
  if (error) return null;
  return Object.fromEntries(
    ((data ?? []) as { type: string; in_app: boolean; email: boolean }[]).map((r) => [r.type, { in_app: r.in_app, email: r.email }])
  );
}

export const NOTIFICATIONS_PAGE_SIZE = 20;

/** One page of a person's notifications, newest first, optionally filtered. */
export async function getNotificationsPage(
  userId: number,
  opts: { page: number; unreadOnly?: boolean; types?: string[] }
): Promise<{ items: Notification[]; total: number }> {
  const page = Math.max(1, Math.min(100, Math.floor(opts.page) || 1));
  let q = db()
    .from("im_notifications")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range((page - 1) * NOTIFICATIONS_PAGE_SIZE, page * NOTIFICATIONS_PAGE_SIZE - 1);
  if (opts.unreadOnly) q = q.eq("is_read", false);
  if (opts.types?.length) q = q.in("type", opts.types);
  const res = await q;
  if (res.error) fail("notifications", res.error);
  return { items: (res.data ?? []) as Notification[], total: res.count ?? 0 };
}

/** The person's saved delivery addresses, default first; null before 0019. */
export async function getAddresses(profileId: number): Promise<AddressLite[] | null> {
  const { data, error } = await db()
    .from("im_addresses")
    .select("id, label, recipient, phone, line1, barangay, city, province, postal_code, is_default")
    .eq("profile_id", profileId)
    .order("is_default", { ascending: false })
    .order("created_at");
  if (error) return null;
  return ((data ?? []) as {
    id: number; label: string | null; recipient: string; phone: string; line1: string; barangay: string | null;
    city: string; province: string | null; postal_code: string | null; is_default: boolean;
  }[]).map((a) => ({
    id: a.id,
    label: a.label,
    recipient: a.recipient,
    phone: a.phone,
    line1: a.line1,
    barangay: a.barangay,
    city: a.city,
    province: a.province,
    postalCode: a.postal_code,
    isDefault: a.is_default,
  }));
}

/** Admin → Discounts: every rule with its target and how often it was used. */
export interface DiscountRuleAdminLite {
  id: number;
  name: string;
  ruleType: "statutory_20" | "bnpc_5" | "voluntary";
  ratePercent: number;
  vatExempt: boolean;
  weeklyPurchaseCap: number | null;
  categoryId: string | null;
  productId: number | null;
  productTitle: string | null;
  fundedBy: "seller" | "platform";
  legalBasis: string;
  enabled: boolean;
  signoffNote: string | null;
  signoffAt: string | null;
  signoffBy: string | null;
  usedOnLines: number;
}

export async function getDiscountRulesForAdmin(): Promise<DiscountRuleAdminLite[] | null> {
  const res = await db().from("im_discount_rules").select("*").order("created_at", { ascending: false });
  if (res.error) return null;
  type Row = {
    id: number; name: string; rule_type: DiscountRuleAdminLite["ruleType"]; rate_percent: number | string; vat_exempt: boolean;
    weekly_purchase_cap: number | string | null; category_id: string | null; product_id: number | null;
    funded_by: "seller" | "platform"; legal_basis: string; enabled: boolean; legal_signoff_note: string | null;
    legal_signoff_at: string | null; legal_signoff_by: number | null;
  };
  const list = (res.data ?? []) as Row[];
  const productIds = list.map((r) => r.product_id).filter((n): n is number => n != null);
  const [titles, names, lines] = await Promise.all([
    productIds.length ? db().from("im_products").select("id, title").in("id", productIds) : Promise.resolve({ data: [] }),
    getDisplayNames(list.map((r) => r.legal_signoff_by ?? 0)),
    list.length ? db().from("im_order_items").select("pwd_rule_id").in("pwd_rule_id", list.map((r) => r.id)) : Promise.resolve({ data: [] }),
  ]);
  const titleOf = new Map(((titles.data ?? []) as { id: number; title: string }[]).map((p) => [p.id, p.title]));
  const used = new Map<number, number>();
  for (const l of (lines.data ?? []) as { pwd_rule_id: number }[]) used.set(l.pwd_rule_id, (used.get(l.pwd_rule_id) ?? 0) + 1);
  return list.map((r) => ({
    id: r.id,
    name: r.name,
    ruleType: r.rule_type,
    ratePercent: Number(r.rate_percent),
    vatExempt: r.vat_exempt,
    weeklyPurchaseCap: r.weekly_purchase_cap == null ? null : Number(r.weekly_purchase_cap),
    categoryId: r.category_id,
    productId: r.product_id,
    productTitle: r.product_id ? titleOf.get(r.product_id) ?? null : null,
    fundedBy: r.funded_by,
    legalBasis: r.legal_basis,
    enabled: r.enabled,
    signoffNote: r.legal_signoff_note,
    signoffAt: r.legal_signoff_at,
    signoffBy: r.legal_signoff_by ? names[r.legal_signoff_by] ?? null : null,
    usedOnLines: used.get(r.id) ?? 0,
  }));
}

/** Is this address on the newsletter (and not unsubscribed)? */
export async function getNewsletterStatus(email: string): Promise<boolean> {
  const { data } = await db()
    .from("im_newsletter_subscribers")
    .select("unsubscribed_at")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  return Boolean(data) && !(data as { unsubscribed_at: string | null }).unsubscribed_at;
}

export interface PrivacyRequestLite {
  id: number;
  kind: string;
  details: string | null;
  status: string;
  response: string | null;
  createdAt: string;
  handledAt: string | null;
}

/** The person's own privacy requests; null before migration 0019. */
export async function getMyPrivacyRequests(profileId: number): Promise<PrivacyRequestLite[] | null> {
  const { data, error } = await db()
    .from("im_privacy_requests")
    .select("id, kind, details, status, response, created_at, handled_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return null;
  return ((data ?? []) as { id: number; kind: string; details: string | null; status: string; response: string | null; created_at: string; handled_at: string | null }[]).map(
    (r) => ({ id: r.id, kind: r.kind, details: r.details, status: r.status, response: r.response, createdAt: r.created_at, handledAt: r.handled_at })
  );
}

/** Name and phone for Account → Profile. */
export async function getMyProfileBasics(profileId: number): Promise<{ name: string; phone: string | null } | null> {
  return one<{ name: string; phone: string | null }>(
    "profile",
    await db().from("im_profiles").select("name, phone").eq("id", profileId).maybeSingle()
  );
}

/** What a new seller has set up (onboarding checklist). */
export async function getSellerSetup(sellerId: number): Promise<{ story: boolean; shopName: boolean }> {
  const full = await db().from("im_profiles").select("seller_story, shop_name").eq("id", sellerId).maybeSingle();
  if (!full.error) {
    const r = full.data as { seller_story: string | null; shop_name: string | null } | null;
    return { story: Boolean(r?.seller_story?.trim()), shopName: Boolean(r?.shop_name?.trim()) };
  }
  const basic = await db().from("im_profiles").select("seller_story").eq("id", sellerId).maybeSingle();
  const r = basic.data as { seller_story: string | null } | null;
  return { story: Boolean(r?.seller_story?.trim()), shopName: true };
}

/** Seller Centre → Shop settings. */
export async function getShopSettings(
  sellerId: number
): Promise<{ shopName: string; story: string; city: string; logo: string | null; banner: string | null; available: boolean }> {
  const full = await db()
    .from("im_profiles")
    .select("seller_story, shop_name, pickup_city, shop_logo_url, shop_banner_url")
    .eq("id", sellerId)
    .maybeSingle();
  if (!full.error) {
    const r = full.data as {
      seller_story: string | null; shop_name: string | null; pickup_city: string | null; shop_logo_url: string | null; shop_banner_url: string | null;
    } | null;
    return {
      shopName: r?.shop_name ?? "",
      story: r?.seller_story ?? "",
      city: r?.pickup_city ?? "",
      logo: r?.shop_logo_url ?? null,
      banner: r?.shop_banner_url ?? null,
      available: true,
    };
  }
  const basic = await db().from("im_profiles").select("seller_story").eq("id", sellerId).maybeSingle();
  return { shopName: "", story: (basic.data as { seller_story: string | null } | null)?.seller_story ?? "", city: "", logo: null, banner: null, available: false };
}

export interface SellerFlashSaleLite {
  id: number;
  productId: number;
  productTitle: string;
  percent: number;
  startsAt: string;
  endsAt: string;
}

/** A seller's flash sales: running, scheduled, and those ended in the last 30 days. */
export async function getSellerFlashSales(sellerId: number): Promise<SellerFlashSaleLite[]> {
  const products = await getSellerProductIndex(sellerId);
  if (!products.length) return [];
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const data = rows<{ id: number; product_id: number; discount_percent: number | string; starts_at: string; ends_at: string }>(
    "flash sales",
    await db()
      .from("im_flash_sales")
      .select("id, product_id, discount_percent, starts_at, ends_at")
      .in("product_id", products.map((p) => p.id))
      .gte("ends_at", since)
      .order("starts_at", { ascending: false })
      .limit(100)
  );
  const title = new Map(products.map((p) => [p.id, p.title]));
  return data.map((f) => ({
    id: f.id,
    productId: f.product_id,
    productTitle: title.get(f.product_id) ?? "Product",
    percent: Number(f.discount_percent),
    startsAt: f.starts_at,
    endsAt: f.ends_at,
  }));
}

export type AdminOrderView = "all" | "refunds" | "returns" | "open" | "cancelled";

export interface AdminOrderLite {
  id: number;
  createdAt: string;
  buyerName: string;
  sellerName: string | null;
  total: number;
  paymentProvider: string | null;
  paymentStatus: string;
  status: string;
  refundDue: boolean;
  returnReason: string | null;
  cancelReason: string | null;
}

/** Admin → Orders (C-40). Names only; no emails or addresses. */
export async function getAdminOrders(view: AdminOrderView): Promise<AdminOrderLite[]> {
  let q = db().from("im_orders").select("*").order("created_at", { ascending: false }).limit(150);
  if (view === "refunds") q = q.eq("refund_due", true);
  if (view === "returns") q = q.eq("order_status", "return_requested");
  if (view === "open") q = q.in("order_status", ["pending", "processing", "shipped"]);
  if (view === "cancelled") q = q.eq("order_status", "cancelled");
  const res = await q;
  if (res.error) {
    // Before migration 0014 there is no refund_due column.
    if (view === "refunds") return [];
    fail("orders", res.error);
  }
  const list = (res.data ?? []) as Order[];
  const names = await getDisplayNames([...list.map((o) => o.buyer_id), ...list.map((o) => o.seller_id ?? 0)]);
  return list.map((o) => ({
    id: o.id,
    createdAt: o.created_at,
    buyerName: names[o.buyer_id] ?? `Buyer #${o.buyer_id}`,
    sellerName: o.seller_id ? names[o.seller_id] ?? null : null,
    total: Number(o.total_amount),
    paymentProvider: o.payment_provider,
    paymentStatus: o.payment_status,
    status: o.order_status,
    refundDue: Boolean(o.refund_due),
    returnReason: o.return_reason ?? null,
    cancelReason: o.cancel_reason ?? null,
  }));
}


export interface UserFootprint {
  products: number;
  orders: number;
  reviews: number;
  tickets: number;
  consents: number;
}

/**
 * Admin → Users: how much each account has done, from one id column per
 * table. The page used to read every product (with its photos), order,
 * review, ticket and consent row to count them.
 */
export async function getUserFootprints(): Promise<Map<number, UserFootprint>> {
  const pick = async (table: string, col: string) => {
    const res = await db().from(table).select(col);
    if (res.error) return [] as number[];
    return ((res.data ?? []) as unknown as Record<string, number | null>[]).map((r) => r[col]).filter((n): n is number => n != null);
  };
  const [products, orders, reviews, tickets, consents] = await Promise.all([
    pick("im_products", "seller_id"),
    pick("im_orders", "buyer_id"),
    pick("im_product_reviews", "buyer_id"),
    pick("im_support_tickets", "user_id"),
    pick("im_consent_logs", "user_id"),
  ]);
  const out = new Map<number, UserFootprint>();
  const bump = (ids: number[], key: keyof UserFootprint) => {
    for (const id of ids) {
      const f = out.get(id) ?? { products: 0, orders: 0, reviews: 0, tickets: 0, consents: 0 };
      f[key]++;
      out.set(id, f);
    }
  };
  bump(products, "products");
  bump(orders, "orders");
  bump(reviews, "reviews");
  bump(tickets, "tickets");
  bump(consents, "consents");
  return out;
}

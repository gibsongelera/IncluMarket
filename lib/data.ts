import "server-only";
import { createAdminClient } from "./supabase/admin";
import type {
  AuditLog,
  Category,
  ConsentLog,
  Conversation,
  FlashSale,
  Message,
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

const db = () => createAdminClient();

// Product photos live in im_product_images (url + position). Hydrate the
// product.images array so cards/detail/cart can show uploaded photos, falling
// back to the emoji placeholder when none exist.
async function imagesByProduct(productIds: number[]): Promise<Record<number, string[]>> {
  const map: Record<number, string[]> = {};
  if (!productIds.length) return map;
  const { data } = await db()
    .from("im_product_images")
    .select("product_id,url,position")
    .in("product_id", productIds)
    .order("position");
  (data ?? []).forEach((row) => {
    (map[row.product_id] ||= []).push(row.url);
  });
  return map;
}

async function hydrateImages(products: Product[]): Promise<Product[]> {
  const map = await imagesByProduct(products.map((p) => p.id));
  return products.map((p) => ({ ...p, images: map[p.id] ?? [] }));
}

export async function getCategories(): Promise<Category[]> {
  const { data } = await db().from("im_categories").select("*").order("label");
  return data ?? [];
}

export async function getApprovedProducts(): Promise<Product[]> {
  const { data } = await db()
    .from("im_products")
    .select("*")
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  return hydrateImages(data ?? []);
}

export async function getAllProducts(): Promise<Product[]> {
  const { data } = await db()
    .from("im_products")
    .select("*")
    .order("created_at", { ascending: false });
  return hydrateImages(data ?? []);
}

export async function getProductsBySeller(sellerId: number): Promise<Product[]> {
  const { data } = await db()
    .from("im_products")
    .select("*")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false });
  return hydrateImages(data ?? []);
}

export async function getProductById(id: number): Promise<Product | null> {
  const { data } = await db().from("im_products").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  return (await hydrateImages([data]))[0];
}

export async function getFeaturedProducts(limit = 8): Promise<Product[]> {
  const { data } = await db()
    .from("im_products")
    .select("*")
    .eq("status", "approved")
    .eq("is_featured", true)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return hydrateImages(data ?? []);
}

// "Customers also viewed" — same category, excludes the current product.
export async function getRelatedProducts(
  category: string | null,
  excludeId: number,
  limit = 6
): Promise<Product[]> {
  if (!category) return [];
  const { data } = await db()
    .from("im_products")
    .select("*")
    .eq("status", "approved")
    .eq("category", category)
    .neq("id", excludeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return hydrateImages(data ?? []);
}

export async function getVerifiedBuyerIds(productId: number): Promise<Set<number>> {
  const { data: items } = await db()
    .from("im_order_items")
    .select("order_id")
    .eq("product_id", productId);
  const orderIds = [...new Set((items ?? []).map((i) => i.order_id))];
  if (!orderIds.length) return new Set();

  const { data: orders } = await db().from("im_orders").select("buyer_id").in("id", orderIds);
  return new Set((orders ?? []).map((o) => o.buyer_id));
}

export async function getVariants(): Promise<ProductVariant[]> {
  const { data } = await db().from("im_product_variants").select("*").order("id");
  return data ?? [];
}

export async function getVariantsByProduct(productId: number): Promise<ProductVariant[]> {
  const { data } = await db()
    .from("im_product_variants")
    .select("*")
    .eq("product_id", productId)
    .order("id");
  return data ?? [];
}

export async function getReviews(): Promise<ProductReview[]> {
  const { data } = await db().from("im_product_reviews").select("*").order("created_at", { ascending: false });
  return data ?? [];
}

export async function getReviewsByProduct(productId: number): Promise<ProductReview[]> {
  const { data } = await db()
    .from("im_product_reviews")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getProfiles(): Promise<Profile[]> {
  const { data } = await db().from("im_profiles").select("*").order("id");
  return data ?? [];
}

export async function getProfileById(id: number): Promise<Profile | null> {
  const { data } = await db().from("im_profiles").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

export async function getFeaturedSellers(): Promise<Profile[]> {
  const { data } = await db()
    .from("im_profiles")
    .select("*")
    .eq("role", "seller")
    .eq("is_featured_seller", true)
    .order("name");
  return data ?? [];
}

export async function getProfileByEmail(email: string): Promise<Profile | null> {
  const { data } = await db()
    .from("im_profiles")
    .select("*")
    .ilike("email", email)
    .maybeSingle();
  return data ?? null;
}

export async function getOrders(): Promise<Order[]> {
  const { data } = await db().from("im_orders").select("*").order("created_at", { ascending: false });
  return data ?? [];
}

export async function getOrdersByBuyer(buyerId: number): Promise<Order[]> {
  const { data } = await db()
    .from("im_orders")
    .select("*")
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getOrderItems(): Promise<OrderItem[]> {
  const { data } = await db().from("im_order_items").select("*").order("id");
  return data ?? [];
}

export async function getOrderStatusHistoryForOrders(
  orderIds: number[]
): Promise<Record<number, OrderStatusHistoryEntry[]>> {
  const map: Record<number, OrderStatusHistoryEntry[]> = {};
  if (!orderIds.length) return map;
  const { data } = await db()
    .from("im_order_status_history")
    .select("*")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });
  (data ?? []).forEach((row) => {
    (map[row.order_id] ||= []).push(row);
  });
  return map;
}

// Active flash sales (now within [starts_at, ends_at]) keyed by product id.
export async function getActiveFlashSales(): Promise<Record<number, FlashSale>> {
  const nowIso = new Date().toISOString();
  const { data } = await db()
    .from("im_flash_sales")
    .select("*")
    .lte("starts_at", nowIso)
    .gte("ends_at", nowIso);
  const map: Record<number, FlashSale> = {};
  (data ?? []).forEach((f) => (map[f.product_id] = f));
  return map;
}

export async function getConversationsForUser(
  userId: number,
  role: "buyer" | "seller"
): Promise<Conversation[]> {
  const col = role === "buyer" ? "buyer_id" : "seller_id";
  const { data } = await db()
    .from("im_conversations")
    .select("*")
    .eq(col, userId)
    .order("updated_at", { ascending: false });
  return data ?? [];
}

export async function getMessagesForConversations(
  conversationIds: number[]
): Promise<Record<number, Message[]>> {
  const map: Record<number, Message[]> = {};
  if (!conversationIds.length) return map;
  const { data } = await db()
    .from("im_messages")
    .select("*")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: true });
  (data ?? []).forEach((m) => {
    (map[m.conversation_id] ||= []).push(m);
  });
  return map;
}

export async function getTickets(): Promise<SupportTicket[]> {
  const { data } = await db().from("im_support_tickets").select("*").order("created_at", { ascending: false });
  return data ?? [];
}

export async function getTicketsForUser(userId: number): Promise<SupportTicket[]> {
  const { data } = await db()
    .from("im_support_tickets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getTicketResponses(): Promise<TicketResponse[]> {
  const { data } = await db().from("im_ticket_responses").select("*").order("created_at");
  return data ?? [];
}

export async function getConsentLogs(): Promise<ConsentLog[]> {
  const { data } = await db().from("im_consent_logs").select("*").order("created_at", { ascending: false });
  return data ?? [];
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  const { data } = await db().from("im_audit_logs").select("*").order("created_at", { ascending: false });
  return data ?? [];
}

export async function getThemeSettings(): Promise<ThemeSettings | null> {
  // Soft-fail during `next build` / missing Vercel env so `/_not-found` prerender
  // can complete. Runtime requests with a real key still load the live theme.
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
  const { data } = await db().from("im_wishlists").select("product_id").eq("user_id", userId);
  return (data ?? []).map((r) => r.product_id);
}

export async function getWishlistProducts(userId: number): Promise<Product[]> {
  const { data: rows } = await db()
    .from("im_wishlists")
    .select("product_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const ids = (rows ?? []).map((r) => r.product_id);
  if (!ids.length) return [];

  const { data: products } = await db().from("im_products").select("*").in("id", ids);
  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  const ordered = ids.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
  return hydrateImages(ordered);
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

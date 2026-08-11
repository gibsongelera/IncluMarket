import "server-only";
import { createAdminClient } from "./supabase/admin";
import type {
  AuditLog,
  Category,
  ConsentLog,
  Order,
  OrderItem,
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

// ---- aggregation helpers ---------------------------------------------------
export function stockByProduct(variants: ProductVariant[]): Record<number, number> {
  const map: Record<number, number> = {};
  for (const v of variants) map[v.product_id] = (map[v.product_id] || 0) + v.stock_qty;
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

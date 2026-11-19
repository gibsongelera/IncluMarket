import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DataUnavailableError, getAllCategories, getDisplayNames } from "@/lib/data";
import { isMissingObject } from "@/lib/db-errors";
import { SETTING_SPECS, type SettingSpec } from "@/lib/settings-spec";

/**
 * Reads behind the admin content pages (C-40): categories, reviews, banners,
 * the newsletter list, settings, the contact inbox and privacy requests.
 * Each returns null when its table or columns are not there yet, so the page
 * can say which migration it needs instead of failing.
 */

const db = () => createAdminClient();

function fail(what: string, error: { message: string }): never {
  console.error(`[admin-content] ${what}: ${error.message}`);
  throw new DataUnavailableError(what);
}

// --- Categories ----------------------------------------------------------

export interface AdminCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  position: number;
  active: boolean;
  products: number;
  liveProducts: number;
}

export async function getAdminCategories(): Promise<{ categories: AdminCategory[]; managed: boolean }> {
  const [cats, products] = await Promise.all([
    getAllCategories(),
    db().from("im_products").select("category, status"),
  ]);
  if (products.error) fail("products", products.error);
  const total = new Map<string, number>();
  const live = new Map<string, number>();
  for (const p of (products.data ?? []) as { category: string | null; status: string }[]) {
    if (!p.category) continue;
    total.set(p.category, (total.get(p.category) ?? 0) + 1);
    if (p.status === "approved") live.set(p.category, (live.get(p.category) ?? 0) + 1);
  }
  return {
    // Before migration 0020 there is no is_active or position column.
    managed: cats.length === 0 || cats.some((c) => c.is_active !== undefined),
    categories: cats.map((c) => ({
      id: c.id,
      name: c.folder || c.label,
      description: c.description ?? null,
      icon: c.icon ?? null,
      position: c.position ?? 0,
      active: c.is_active !== false,
      products: total.get(c.id) ?? 0,
      liveProducts: live.get(c.id) ?? 0,
    })),
  };
}

// --- Reviews -------------------------------------------------------------

export interface AdminReview {
  id: number;
  productId: number;
  productTitle: string;
  reviewer: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  hidden: boolean;
  hiddenReason: string | null;
  hiddenAt: string | null;
  sellerReply: string | null;
}

export type AdminReviewView = "recent" | "low" | "hidden";

export async function getAdminReviews(view: AdminReviewView): Promise<AdminReview[] | null> {
  let q = db()
    .from("im_product_reviews")
    .select("id, product_id, buyer_id, rating_score, comment_text, created_at, status, hidden_reason, hidden_at, seller_reply")
    .order("created_at", { ascending: false })
    .limit(100);
  if (view === "hidden") q = q.eq("status", "hidden");
  else q = q.eq("status", "visible");
  if (view === "low") q = q.lte("rating_score", 2);
  const { data, error } = await q;
  if (error) {
    if (isMissingObject(error)) return null;
    fail("reviews", error);
  }
  const list = (data ?? []) as {
    id: number;
    product_id: number;
    buyer_id: number;
    rating_score: number;
    comment_text: string | null;
    created_at: string;
    status: string;
    hidden_reason: string | null;
    hidden_at: string | null;
    seller_reply: string | null;
  }[];
  const productIds = [...new Set(list.map((r) => r.product_id))];
  const [names, products] = await Promise.all([
    getDisplayNames(list.map((r) => r.buyer_id)),
    productIds.length ? db().from("im_products").select("id, title").in("id", productIds) : Promise.resolve({ data: [] }),
  ]);
  const titles = new Map(((products.data ?? []) as { id: number; title: string }[]).map((p) => [p.id, p.title]));
  return list.map((r) => ({
    id: r.id,
    productId: r.product_id,
    productTitle: titles.get(r.product_id) ?? `Product #${r.product_id}`,
    reviewer: names[r.buyer_id] ?? `User #${r.buyer_id}`,
    rating: r.rating_score,
    comment: r.comment_text,
    createdAt: r.created_at,
    hidden: r.status === "hidden",
    hiddenReason: r.hidden_reason,
    hiddenAt: r.hidden_at,
    sellerReply: r.seller_reply,
  }));
}

// --- Banners -------------------------------------------------------------

export interface AdminBanner {
  id: number;
  title: string;
  alt: string;
  image: string;
  link: string | null;
  startsAt: string;
  endsAt: string | null;
  position: number;
  active: boolean;
  /** Showing on the homepage right now. */
  live: boolean;
}

export async function getAdminBanners(): Promise<AdminBanner[] | null> {
  const { data, error } = await db()
    .from("im_banners")
    .select("id, title, alt_text, image_url, link_url, starts_at, ends_at, position, is_active")
    .order("position")
    .order("id");
  if (error) {
    if (isMissingObject(error)) return null;
    fail("banners", error);
  }
  const now = Date.now();
  return (
    (data ?? []) as {
      id: number;
      title: string;
      alt_text: string;
      image_url: string;
      link_url: string | null;
      starts_at: string;
      ends_at: string | null;
      position: number;
      is_active: boolean;
    }[]
  ).map((b) => ({
    id: b.id,
    title: b.title,
    alt: b.alt_text,
    image: b.image_url,
    link: b.link_url,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    position: b.position,
    active: b.is_active,
    live: b.is_active && Date.parse(b.starts_at) <= now && (!b.ends_at || Date.parse(b.ends_at) > now),
  }));
}

// --- Newsletter ----------------------------------------------------------

export interface Subscriber {
  id: number;
  email: string;
  subscribedAt: string;
  unsubscribedAt: string | null;
  source: string | null;
}

export async function getNewsletterSubscribers(): Promise<Subscriber[]> {
  const { data, error } = await db()
    .from("im_newsletter_subscribers")
    .select("id, email, subscribed_at, unsubscribed_at, source")
    .order("subscribed_at", { ascending: false })
    .limit(2000);
  if (error) fail("newsletter", error);
  return ((data ?? []) as { id: number; email: string; subscribed_at: string; unsubscribed_at: string | null; source: string | null }[]).map(
    (s) => ({ id: s.id, email: s.email, subscribedAt: s.subscribed_at, unsubscribedAt: s.unsubscribed_at, source: s.source })
  );
}

// --- Settings ------------------------------------------------------------

export interface AdminSetting extends SettingSpec {
  value: number;
  /** Stored in the database (false: the default applies). */
  stored: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export async function getAdminSettings(): Promise<AdminSetting[] | null> {
  const { data, error } = await db()
    .from("im_settings")
    .select("key, value, updated_by, updated_at")
    .in("key", SETTING_SPECS.map((s) => s.key));
  if (error) {
    if (isMissingObject(error)) return null;
    fail("settings", error);
  }
  const rows = (data ?? []) as { key: string; value: unknown; updated_by: number | null; updated_at: string | null }[];
  const names = await getDisplayNames(rows.map((r) => r.updated_by ?? 0));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return SETTING_SPECS.map((spec) => {
    const row = byKey.get(spec.key);
    const n = row ? Number.parseInt(String(row.value), 10) : NaN;
    return {
      ...spec,
      value: Number.isFinite(n) ? n : spec.default,
      stored: Boolean(row),
      updatedAt: row?.updated_at ?? null,
      updatedBy: row?.updated_by ? (names[row.updated_by] ?? null) : null,
    };
  });
}

// --- Contact inbox and privacy requests ------------------------------------

export interface ContactMessage {
  id: number;
  name: string;
  email: string;
  topic: string;
  message: string;
  status: "new" | "answered" | "closed";
  createdAt: string;
  signedIn: boolean;
}

export async function getContactMessages(): Promise<ContactMessage[] | null> {
  const { data, error } = await db()
    .from("im_contact_messages")
    .select("id, profile_id, name, email, topic, message, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    if (isMissingObject(error)) return null;
    fail("contact messages", error);
  }
  return (
    (data ?? []) as {
      id: number;
      profile_id: number | null;
      name: string;
      email: string;
      topic: string;
      message: string;
      status: ContactMessage["status"];
      created_at: string;
    }[]
  ).map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    topic: m.topic,
    message: m.message,
    status: m.status,
    createdAt: m.created_at,
    signedIn: m.profile_id != null,
  }));
}

export interface AdminPrivacyRequest {
  id: number;
  kind: "access" | "correction" | "deletion" | "objection";
  details: string | null;
  status: "open" | "in_progress" | "done" | "rejected";
  response: string | null;
  requester: string;
  requesterEmail: string | null;
  createdAt: string;
  handledAt: string | null;
  /** RA 10173 practice: answer within 15 days. */
  dueAt: string;
}

export async function getPrivacyRequestsForAdmin(): Promise<AdminPrivacyRequest[] | null> {
  const { data, error } = await db()
    .from("im_privacy_requests")
    .select("id, profile_id, kind, details, status, response, handled_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    if (isMissingObject(error)) return null;
    fail("privacy requests", error);
  }
  const list = (data ?? []) as {
    id: number;
    profile_id: number | null;
    kind: AdminPrivacyRequest["kind"];
    details: string | null;
    status: AdminPrivacyRequest["status"];
    response: string | null;
    handled_at: string | null;
    created_at: string;
  }[];
  const ids = [...new Set(list.map((r) => r.profile_id).filter((n): n is number => n != null))];
  const { data: people } = ids.length
    ? await db().from("im_profiles").select("id, name, email").in("id", ids)
    : { data: [] };
  const byId = new Map(((people ?? []) as { id: number; name: string; email: string }[]).map((p) => [p.id, p]));
  return list.map((r) => {
    const who = r.profile_id != null ? byId.get(r.profile_id) : undefined;
    return {
      id: r.id,
      kind: r.kind,
      details: r.details,
      status: r.status,
      response: r.response,
      requester: who?.name ?? "Deleted account",
      requesterEmail: who?.email ?? null,
      createdAt: r.created_at,
      handledAt: r.handled_at,
      dueAt: new Date(Date.parse(r.created_at) + 15 * 86_400_000).toISOString(),
    };
  });
}

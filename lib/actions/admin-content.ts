"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { boundedText } from "@/lib/validation/data-url";
import { isMissingObject } from "@/lib/db-errors";
import { createNotification } from "@/lib/notify";
import { queueEmail } from "@/lib/email/send";
import { storePublicImage } from "@/lib/media";
import { settingSpec } from "@/lib/settings-spec";
import { isCategoryIcon } from "@/lib/category-icons";

/**
 * Admin content (C-40): categories, review hiding, homepage banners, the
 * newsletter list, settings, the contact inbox and privacy requests.
 * Public endpoints: each checks for an admin session first, returns
 * { ok, error } and never throws, and writes the audit log.
 */

export interface ContentResult {
  ok: boolean;
  error?: string;
}

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

async function audit(actorId: number, action: string, target: string) {
  await createAdminClient().from("im_audit_logs").insert({ actor_id: actorId, actor_role: "admin", action, target });
}

const DENIED: ContentResult = { ok: false, error: "Admin access required." };

// --- Categories ----------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function storefrontChanged() {
  revalidatePath("/admin/categories");
  revalidatePath("/home");
  revalidatePath("/search");
}

export interface CategoryInput {
  id?: string | null;
  name: string;
  description?: string | null;
  icon?: string | null;
}

/** Create a category, or rename / describe / re-icon an existing one. */
export async function saveCategory(input: CategoryInput): Promise<ContentResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  const name = boundedText(input?.name, 60);
  if (!name || name.length < 2) return { ok: false, error: "Give the category a name (2 characters or more)." };
  const description = boundedText(input?.description, 300);
  const icon = input?.icon && isCategoryIcon(input.icon) ? input.icon : null;
  const db = createAdminClient();

  if (input?.id) {
    const id = String(input.id);
    const full = await db.from("im_categories").update({ label: name, folder: name, description, icon }).eq("id", id).select("id");
    let res = full;
    // Before migration 0020: only the name can change.
    if (full.error && isMissingObject(full.error)) {
      res = await db.from("im_categories").update({ label: name, folder: name }).eq("id", id).select("id");
    }
    if (res.error) return { ok: false, error: "Could not save the category. Please try again." };
    if (!res.data?.length) return { ok: false, error: "Category not found." };
    await audit(admin.user_id, "category_updated", `category:${id}`);
    storefrontChanged();
    return { ok: true };
  }

  const id = slugify(name);
  if (id.length < 2) return { ok: false, error: "Use letters or numbers in the name." };
  const { data: clash } = await db.from("im_categories").select("id").eq("id", id).maybeSingle();
  if (clash) return { ok: false, error: "A category with that name already exists. Restore it, or choose another name." };

  const { data: last } = await db.from("im_categories").select("*");
  const position = Math.max(0, ...((last ?? []) as { position?: number }[]).map((c) => c.position ?? 0)) + 1;
  let ins = await db.from("im_categories").insert({ id, label: name, folder: name, description, icon, position, is_active: true });
  if (ins.error && isMissingObject(ins.error)) ins = await db.from("im_categories").insert({ id, label: name, folder: name });
  if (ins.error) return { ok: false, error: "Could not create the category. Please try again." };
  await audit(admin.user_id, "category_created", `category:${id}`);
  storefrontChanged();
  return { ok: true };
}

/**
 * Retire or restore a category. Retiring never deletes: its products stay
 * listed and keep their category; it only leaves the filters and the list a
 * seller picks from.
 */
export async function setCategoryActive(id: string, active: boolean): Promise<ContentResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  const { data, error } = await createAdminClient()
    .from("im_categories")
    .update({ is_active: Boolean(active) })
    .eq("id", String(id))
    .select("id");
  if (error) {
    if (isMissingObject(error)) return { ok: false, error: "Retiring categories needs database migration 0020." };
    return { ok: false, error: "Could not change the category. Please try again." };
  }
  if (!data?.length) return { ok: false, error: "Category not found." };
  await audit(admin.user_id, active ? "category_restored" : "category_retired", `category:${id}`);
  storefrontChanged();
  return { ok: true };
}

/** Move a category one place up or down (buttons, not drag and drop). */
export async function moveCategory(id: string, direction: "up" | "down"): Promise<ContentResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  const db = createAdminClient();
  const { data, error } = await db.from("im_categories").select("id, label, position");
  if (error) {
    if (isMissingObject(error)) return { ok: false, error: "Ordering categories needs database migration 0020." };
    return { ok: false, error: "Could not move the category. Please try again." };
  }
  const list = ((data ?? []) as { id: string; label: string; position: number }[]).sort(
    (a, b) => a.position - b.position || a.label.localeCompare(b.label)
  );
  const i = list.findIndex((c) => c.id === String(id));
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0) return { ok: false, error: "Category not found." };
  if (j < 0 || j >= list.length) return { ok: true };
  [list[i], list[j]] = [list[j], list[i]];
  // Renumber 1..n so ties from the seed never make a move look like a no-op.
  const changes = list.map((c, n) => ({ id: c.id, position: n + 1, was: c.position })).filter((c) => c.position !== c.was);
  for (const c of changes) {
    const { error: upErr } = await db.from("im_categories").update({ position: c.position }).eq("id", c.id);
    if (upErr) return { ok: false, error: "Could not move the category. Please try again." };
  }
  await audit(admin.user_id, "category_moved", `category:${id} ${direction}`);
  storefrontChanged();
  return { ok: true };
}

// --- Reviews -------------------------------------------------------------

/**
 * Hide a review (with a reason the reviewer is told) or show it again. A
 * hidden review leaves the product page and the rating — the database's
 * review trigger recomputes it.
 */
export async function setReviewHidden(reviewId: number, hidden: boolean, reason: string): Promise<ContentResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  const why = boundedText(reason, 300);
  if (hidden && (!why || why.length < 5)) return { ok: false, error: "Say why it is hidden (5 characters or more). The reviewer reads this." };
  const db = createAdminClient();
  const { data: review } = await db
    .from("im_product_reviews")
    .select("id, product_id, buyer_id")
    .eq("id", Number(reviewId))
    .maybeSingle();
  if (!review) return { ok: false, error: "Review not found." };
  const patch = hidden
    ? { status: "hidden", hidden_reason: why, hidden_by: admin.user_id, hidden_at: new Date().toISOString() }
    : { status: "visible", hidden_reason: null, hidden_by: null, hidden_at: null };
  const { error } = await db.from("im_product_reviews").update(patch).eq("id", review.id);
  if (error) {
    if (isMissingObject(error)) return { ok: false, error: "Hiding reviews needs database migration 0019." };
    return { ok: false, error: "Could not change the review. Please try again." };
  }
  await audit(admin.user_id, hidden ? "review_hidden" : "review_restored", `review:${review.id}${hidden ? ` ${why}` : ""}`);
  await createNotification({
    userId: review.buyer_id,
    type: "moderation",
    title: hidden ? "Your review was hidden" : "Your review is visible again",
    body: hidden ? `Reason: ${why}` : undefined,
    link: `/buyer/product/${review.product_id}`,
  });
  revalidatePath("/admin/reviews");
  revalidatePath(`/buyer/product/${review.product_id}`);
  revalidatePath("/seller/reviews");
  return { ok: true };
}

// --- Banners -------------------------------------------------------------

/** Same rule as the table's check (0019): a path inside the shop, never //host. */
const INTERNAL_LINK_RE = /^\/([A-Za-z0-9_?=&%.-][A-Za-z0-9/_?=&%.-]*)?$/;

/** A datetime-local value, read as Philippine time. */
function manilaInstant(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const t = Date.parse(`${value}:00+08:00`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function bannersChanged() {
  revalidatePath("/admin/banners");
  revalidatePath("/home");
}

/**
 * Create a banner (photo required) or edit one (new photo optional). The
 * photo is checked and stored like any product photo; the alt text is
 * required because the banner is an image of text.
 */
export async function saveBanner(form: FormData): Promise<ContentResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  const id = Number(form.get("id") || 0);
  const title = boundedText(form.get("title"), 120);
  if (!title || title.length < 2) return { ok: false, error: "Give the banner a title." };
  const alt = boundedText(form.get("alt"), 200);
  if (!alt || alt.length < 2) return { ok: false, error: "Describe the banner for people who cannot see it." };
  const rawLink = boundedText(form.get("link"), 300);
  if (rawLink && !INTERNAL_LINK_RE.test(rawLink)) {
    return { ok: false, error: "Links must stay inside the shop and start with one /, for example /search?category=bags." };
  }
  const startsRaw = form.get("startsAt");
  const startsAt = startsRaw ? manilaInstant(startsRaw) : new Date().toISOString();
  if (!startsAt) return { ok: false, error: "Check the start date and time." };
  const endsRaw = form.get("endsAt");
  const endsAt = endsRaw ? manilaInstant(endsRaw) : null;
  if (endsRaw && !endsAt) return { ok: false, error: "Check the end date and time." };
  if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) return { ok: false, error: "The end must be after the start." };

  const photo = form.get("photo");
  const hasPhoto = photo instanceof File && photo.size > 0;
  if (!id && !hasPhoto) return { ok: false, error: "Choose a banner image." };
  let imageUrl: string | null = null;
  if (hasPhoto) {
    const stored = await storePublicImage(admin.user_id, photo);
    if (!stored.ok) return { ok: false, error: stored.error };
    imageUrl = stored.url;
  }

  const db = createAdminClient();
  const fields: Record<string, unknown> = { title, alt_text: alt, link_url: rawLink, starts_at: startsAt, ends_at: endsAt };
  if (imageUrl) fields.image_url = imageUrl;

  if (id) {
    const { data, error } = await db.from("im_banners").update(fields).eq("id", id).select("id");
    if (error) return { ok: false, error: isMissingObject(error) ? "Banners need database migration 0019." : "Could not save the banner." };
    if (!data?.length) return { ok: false, error: "Banner not found." };
    await audit(admin.user_id, "banner_updated", `banner:${id}`);
  } else {
    const { data: rows } = await db.from("im_banners").select("position");
    const position = Math.max(0, ...((rows ?? []) as { position: number }[]).map((b) => b.position)) + 1;
    const { data, error } = await db
      .from("im_banners")
      .insert({ ...fields, position, is_active: true, created_by: admin.user_id })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, error: error && isMissingObject(error) ? "Banners need database migration 0019." : "Could not create the banner." };
    }
    await audit(admin.user_id, "banner_created", `banner:${data.id}`);
  }
  bannersChanged();
  return { ok: true };
}

export async function setBannerActive(id: number, active: boolean): Promise<ContentResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  const { data, error } = await createAdminClient()
    .from("im_banners")
    .update({ is_active: Boolean(active) })
    .eq("id", Number(id))
    .select("id");
  if (error) return { ok: false, error: "Could not change the banner. Please try again." };
  if (!data?.length) return { ok: false, error: "Banner not found." };
  await audit(admin.user_id, active ? "banner_shown" : "banner_hidden", `banner:${id}`);
  bannersChanged();
  return { ok: true };
}

export async function moveBanner(id: number, direction: "up" | "down"): Promise<ContentResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  const db = createAdminClient();
  const { data, error } = await db.from("im_banners").select("id, position").order("position").order("id");
  if (error) return { ok: false, error: "Could not move the banner. Please try again." };
  const list = (data ?? []) as { id: number; position: number }[];
  const i = list.findIndex((b) => b.id === Number(id));
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0) return { ok: false, error: "Banner not found." };
  if (j < 0 || j >= list.length) return { ok: true };
  [list[i], list[j]] = [list[j], list[i]];
  for (const [n, b] of list.entries()) {
    if (b.position === n + 1) continue;
    const { error: upErr } = await db.from("im_banners").update({ position: n + 1 }).eq("id", b.id);
    if (upErr) return { ok: false, error: "Could not move the banner. Please try again." };
  }
  await audit(admin.user_id, "banner_moved", `banner:${id} ${direction}`);
  bannersChanged();
  return { ok: true };
}

export async function deleteBanner(id: number): Promise<ContentResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  const { data, error } = await createAdminClient().from("im_banners").delete().eq("id", Number(id)).select("id");
  if (error) return { ok: false, error: "Could not delete the banner. Please try again." };
  if (!data?.length) return { ok: false, error: "Banner not found." };
  await audit(admin.user_id, "banner_deleted", `banner:${id}`);
  bannersChanged();
  return { ok: true };
}

// --- Newsletter ----------------------------------------------------------

/** A spreadsheet must not run a cell as a formula (CSV injection). */
function csvCell(value: unknown): string {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Current subscribers as CSV. Every export is audited (it is personal data). */
export async function exportNewsletter(): Promise<ContentResult & { csv?: string; filename?: string; count?: number }> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  const { data, error } = await createAdminClient()
    .from("im_newsletter_subscribers")
    .select("email, subscribed_at, source")
    .is("unsubscribed_at", null)
    .order("subscribed_at");
  if (error) return { ok: false, error: "Could not read the list. Please try again." };
  const rows = (data ?? []) as { email: string; subscribed_at: string; source: string | null }[];
  const csv = [
    "email,subscribed_at,source",
    ...rows.map((r) => [r.email, r.subscribed_at, r.source ?? ""].map(csvCell).join(",")),
  ].join("\r\n");
  await audit(admin.user_id, "newsletter_exported", `newsletter:${rows.length}`);
  const day = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  return { ok: true, csv, filename: `newsletter-subscribers-${day}.csv`, count: rows.length };
}

/** Unsubscribe someone who asked by other means (email, phone, in person). */
export async function unsubscribeSubscriber(id: number): Promise<ContentResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  const { data, error } = await createAdminClient()
    .from("im_newsletter_subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("id", Number(id))
    .is("unsubscribed_at", null)
    .select("id");
  if (error) return { ok: false, error: "Could not unsubscribe them. Please try again." };
  if (!data?.length) return { ok: false, error: "Already unsubscribed." };
  await audit(admin.user_id, "newsletter_unsubscribed", `newsletter_subscriber:${id}`);
  revalidatePath("/admin/newsletter");
  return { ok: true };
}

// --- Settings ------------------------------------------------------------

/** Change one setting from lib/settings-spec.ts, inside its bounds. */
export async function saveSetting(key: string, value: number): Promise<ContentResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  const spec = settingSpec(String(key));
  if (!spec) return { ok: false, error: "That setting cannot be changed here." };
  const n = Number(value);
  if (!Number.isInteger(n) || n < spec.min || n > spec.max) {
    return { ok: false, error: `${spec.label} must be a whole number from ${spec.min} to ${spec.max}.` };
  }
  const db = createAdminClient();
  const { data: old } = await db.from("im_settings").select("value").eq("key", spec.key).maybeSingle();
  const { error } = await db
    .from("im_settings")
    .upsert({ key: spec.key, value: n, updated_by: admin.user_id, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) {
    if (isMissingObject(error)) return { ok: false, error: "Settings need database migration 0014." };
    return { ok: false, error: "Could not save the setting. Please try again." };
  }
  await audit(admin.user_id, "setting_changed", `setting:${spec.key} ${old ? String(old.value) : `default ${spec.default}`} -> ${n}`);
  revalidatePath("/admin/settings");
  return { ok: true };
}

// --- Contact inbox and privacy requests ------------------------------------

export async function setContactStatus(id: number, status: "new" | "answered" | "closed"): Promise<ContentResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  if (!["new", "answered", "closed"].includes(status)) return { ok: false, error: "Unknown status." };
  const { data, error } = await createAdminClient()
    .from("im_contact_messages")
    .update({ status })
    .eq("id", Number(id))
    .select("id");
  if (error) return { ok: false, error: "Could not update the message. Please try again." };
  if (!data?.length) return { ok: false, error: "Message not found." };
  await audit(admin.user_id, "contact_status", `contact_message:${id} ${status}`);
  revalidatePath("/admin/compliance");
  revalidatePath("/admin");
  return { ok: true };
}

const PRIVACY_STATUSES = ["in_progress", "done", "rejected"] as const;

/**
 * Answer a data-subject request (RA 10173). Finishing or refusing one needs a
 * written answer; the requester gets it in the app and by email — it is a
 * legal reply, so it goes whatever their email preferences say.
 */
export async function respondPrivacyRequest(
  id: number,
  status: (typeof PRIVACY_STATUSES)[number],
  response: string
): Promise<ContentResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  if (!PRIVACY_STATUSES.includes(status)) return { ok: false, error: "Choose a status." };
  const text = boundedText(response, 2000);
  if (status !== "in_progress" && (!text || text.length < 10)) {
    return { ok: false, error: "Write the answer the requester will read (10 characters or more)." };
  }
  const db = createAdminClient();
  const { data: req } = await db.from("im_privacy_requests").select("id, profile_id, kind, status").eq("id", Number(id)).maybeSingle();
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status === "done" || req.status === "rejected") return { ok: false, error: "This request is already closed." };
  const { error } = await db
    .from("im_privacy_requests")
    .update({ status, response: text, handled_by: admin.user_id, handled_at: new Date().toISOString() })
    .eq("id", req.id);
  if (error) return { ok: false, error: "Could not save the answer. Please try again." };
  await audit(admin.user_id, "privacy_request_answered", `privacy_request:${req.id} ${status}`);

  if (req.profile_id) {
    const { data: who } = await db.from("im_profiles").select("name, email").eq("id", req.profile_id).maybeSingle();
    await createNotification({
      userId: req.profile_id,
      type: "account",
      title: `Privacy request #${req.id}: ${status === "done" ? "completed" : status === "rejected" ? "answered" : "in progress"}`,
      body: text ?? undefined,
      link: "/account/privacy",
    });
    if (who?.email) {
      await queueEmail(
        "privacy_response",
        { email: who.email, name: who.name },
        { name: who.name, requestId: req.id, status, response: text }
      );
    }
  }
  revalidatePath("/admin/compliance");
  revalidatePath("/admin");
  revalidatePath("/account/privacy");
  return { ok: true };
}

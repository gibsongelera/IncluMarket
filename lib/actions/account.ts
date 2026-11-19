"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { isMissingObject } from "@/lib/db-errors";
import { cleanUiPrefs, type UiPrefs } from "@/lib/a11y/prefs";
import { PH_PHONE_RE, cleanAddress, cleanPhone, type AddressFields } from "@/lib/address";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RATE_LIMITED_MESSAGE, rateLimit } from "@/lib/security/rate-limit";
import { createNotification, notifyAdmins } from "@/lib/notify";
import { queueEmail } from "@/lib/email/send";

export interface AccountActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Personalised recommendations on or off (C-20, Q23). Turning them off also
 * deletes the product views already recorded — the right to object covers
 * the data, not only its future use. Recorded in im_consent_logs.
 */
export async function setPersonalization(enabled: boolean): Promise<AccountActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const { error } = await db
    .from("im_profiles")
    .update({ personalization_opt_out: !enabled })
    .eq("id", session.user_id);
  if (error) {
    if (isMissingObject(error)) return { ok: false, error: "This setting needs database migration 0019." };
    return { ok: false, error: "Could not save the setting. Please try again." };
  }
  if (!enabled) await db.from("im_product_views").delete().eq("profile_id", session.user_id);
  await db.from("im_consent_logs").insert({
    user_id: session.user_id,
    action: enabled ? "personalization_on" : "personalization_off",
    consent: enabled,
    purpose: "Product recommendations from viewed, saved and bought categories (views kept 90 days).",
  });
  revalidatePath("/account");
  revalidatePath("/home");
  return { ok: true };
}


type PrefsRow = {
  font_size_px: number;
  contrast: string;
  reduce_motion: boolean;
  tts_enabled: boolean;
  voice_commands: boolean;
  reading_mode: boolean;
  highlight_on_read: boolean;
  speech_rate: number | string;
  large_cursors?: boolean;
  visual_alerts?: boolean;
};

/**
 * The signed-in person's saved accessibility settings (C-22), so a setting
 * chosen on one device applies after signing in on another. Guests get
 * { signedIn: false } and keep their settings in the browser only.
 */
export async function getUiPrefs(): Promise<{ signedIn: boolean; userId?: number; prefs?: UiPrefs | null }> {
  const session = await getSession();
  if (!session) return { signedIn: false };
  const { data, error } = await createAdminClient()
    .from("im_ui_prefs")
    .select("*")
    .eq("user_id", session.user_id)
    .maybeSingle();
  if (error || !data) return { signedIn: true, userId: session.user_id, prefs: null };
  const r = data as PrefsRow;
  return {
    signedIn: true,
    userId: session.user_id,
    prefs: {
      fontSize: cleanUiPrefs({ fontSize: r.font_size_px }).fontSize ?? 16,
      contrast: r.contrast === "high",
      reduceMotion: Boolean(r.reduce_motion),
      largeCursors: Boolean(r.large_cursors),
      visualAlerts: Boolean(r.visual_alerts),
      tts: Boolean(r.tts_enabled),
      voice: Boolean(r.voice_commands),
      reading: Boolean(r.reading_mode),
      highlight: r.highlight_on_read !== false,
      speechRate: Number(r.speech_rate) || 1,
    },
  };
}

/** Save changed accessibility settings to the account. Guests: no-op. */
export async function saveUiPrefs(input: Partial<UiPrefs>): Promise<AccountActionResult> {
  const session = await getSession();
  if (!session) return { ok: true };
  const p = cleanUiPrefs(input);
  const row: Record<string, unknown> = { user_id: session.user_id, updated_at: new Date().toISOString() };
  if (p.fontSize !== undefined) row.font_size_px = p.fontSize;
  if (p.contrast !== undefined) row.contrast = p.contrast ? "high" : "default";
  if (p.reduceMotion !== undefined) row.reduce_motion = p.reduceMotion;
  if (p.tts !== undefined) row.tts_enabled = p.tts;
  if (p.voice !== undefined) row.voice_commands = p.voice;
  if (p.reading !== undefined) row.reading_mode = p.reading;
  if (p.highlight !== undefined) row.highlight_on_read = p.highlight;
  if (p.speechRate !== undefined) row.speech_rate = p.speechRate;
  if (p.largeCursors !== undefined) row.large_cursors = p.largeCursors;
  if (p.visualAlerts !== undefined) row.visual_alerts = p.visualAlerts;

  const db = createAdminClient();
  let { error } = await db.from("im_ui_prefs").upsert(row, { onConflict: "user_id" });
  if (error && isMissingObject(error)) {
    // Before migration 0022: save what has a column.
    delete row.large_cursors;
    delete row.visual_alerts;
    ({ error } = await db.from("im_ui_prefs").upsert(row, { onConflict: "user_id" }));
  }
  return error ? { ok: false, error: "Could not save your settings to your account." } : { ok: true };
}

// --- Address book (im_addresses, 0019) ------------------------------------------

function addressRow(v: AddressFields) {
  return {
    label: v.label,
    recipient: v.recipient,
    phone: v.phone,
    line1: v.line1,
    barangay: v.barangay,
    city: v.city,
    province: v.province,
    postal_code: v.postalCode,
  };
}

/**
 * Add an address, or update one of the signed-in person's own (id given).
 * The first address, or one marked so, becomes the default.
 */
export async function saveAddress(
  input: Partial<Record<keyof AddressFields, unknown>> & { id?: number; makeDefault?: boolean }
): Promise<AccountActionResult & { id?: number; field?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  const clean = cleanAddress(input);
  if (!clean.ok) return { ok: false, error: clean.error, field: clean.field };

  const db = createAdminClient();
  const { data: mine, error: readErr } = await db.from("im_addresses").select("id, is_default").eq("profile_id", session.user_id);
  if (readErr) {
    if (isMissingObject(readErr)) return { ok: false, error: "Saved addresses need database migration 0019." };
    return { ok: false, error: "Could not save the address. Please try again." };
  }
  const list = (mine ?? []) as { id: number; is_default: boolean }[];
  if (input.id != null && !list.some((a) => a.id === Number(input.id))) return { ok: false, error: "That address is not yours." };
  if (input.id == null && list.length >= 10) return { ok: false, error: "You can save up to 10 addresses. Remove one first." };

  const makeDefault = Boolean(input.makeDefault) || list.length === 0;
  if (makeDefault) {
    await db.from("im_addresses").update({ is_default: false }).eq("profile_id", session.user_id).eq("is_default", true);
  }
  const now = new Date().toISOString();
  const res =
    input.id != null
      ? await db
          .from("im_addresses")
          .update({ ...addressRow(clean.value), ...(makeDefault ? { is_default: true } : {}), updated_at: now })
          .eq("id", Number(input.id))
          .eq("profile_id", session.user_id)
          .select("id")
          .single()
      : await db
          .from("im_addresses")
          .insert({ ...addressRow(clean.value), profile_id: session.user_id, is_default: makeDefault })
          .select("id")
          .single();
  if (res.error || !res.data) return { ok: false, error: "Could not save the address. Please try again." };
  revalidatePath("/account/addresses");
  revalidatePath("/buyer/checkout");
  return { ok: true, id: res.data.id };
}

export async function deleteAddress(id: number): Promise<AccountActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const { data, error } = await db
    .from("im_addresses")
    .delete()
    .eq("id", Number(id))
    .eq("profile_id", session.user_id)
    .select("is_default")
    .maybeSingle();
  if (error) return { ok: false, error: "Could not remove the address. Please try again." };
  if (!data) return { ok: false, error: "That address is not yours." };
  // Keep one default when there are addresses left.
  if (data.is_default) {
    const { data: next } = await db.from("im_addresses").select("id").eq("profile_id", session.user_id).order("created_at").limit(1).maybeSingle();
    if (next) await db.from("im_addresses").update({ is_default: true }).eq("id", next.id);
  }
  revalidatePath("/account/addresses");
  return { ok: true };
}

export async function setDefaultAddress(id: number): Promise<AccountActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const { data: own } = await db.from("im_addresses").select("id").eq("id", Number(id)).eq("profile_id", session.user_id).maybeSingle();
  if (!own) return { ok: false, error: "That address is not yours." };
  await db.from("im_addresses").update({ is_default: false }).eq("profile_id", session.user_id).eq("is_default", true);
  const { error } = await db.from("im_addresses").update({ is_default: true }).eq("id", own.id);
  if (error) return { ok: false, error: "Could not update. Please try again." };
  revalidatePath("/account/addresses");
  return { ok: true };
}

// --- Profile ----------------------------------------------------------------------

/** Name and phone on the account (C-30). The email is changed through support. */
export async function updateProfile(input: { name: string; phone: string }): Promise<AccountActionResult & { field?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  const name = String(input?.name ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 80) return { ok: false, field: "name", error: "Enter your name (2 to 80 characters)." };
  const phone = cleanPhone(input?.phone);
  if (phone && !PH_PHONE_RE.test(phone)) {
    return { ok: false, field: "phone", error: "Enter a Philippine number, for example 09171234567, or leave it empty." };
  }
  const { error } = await createAdminClient()
    .from("im_profiles")
    .update({ name, phone: phone || null, updated_at: new Date().toISOString() })
    .eq("id", session.user_id);
  if (error) return { ok: false, error: "Could not save your profile. Please try again." };
  await createAdminClient().from("im_audit_logs").insert({
    actor_id: session.user_id,
    actor_role: session.role,
    action: "updated_profile",
    target: `profile:${session.user_id}`,
  });
  revalidatePath("/account", "layout");
  return { ok: true };
}

const MIN_PASSWORD = 8;

/**
 * Change the password while signed in. The current password is checked
 * first, so a borrowed, unlocked device cannot lock its owner out.
 */
export async function changePassword(current: string, next: string): Promise<AccountActionResult & { field?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  const limited = await rateLimit("change_password", `user:${session.user_id}`, { limit: 5, windowSeconds: 900 });
  if (!limited.ok) return { ok: false, error: RATE_LIMITED_MESSAGE };
  const pw = String(next ?? "");
  if (pw.length < MIN_PASSWORD) return { ok: false, field: "next", error: `Use at least ${MIN_PASSWORD} characters.` };
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return { ok: false, field: "next", error: "Include at least one letter and one number." };
  if (pw === current) return { ok: false, field: "next", error: "Choose a password different from the current one." };

  const supabase = await createSupabaseServerClient();
  const check = await supabase.auth.signInWithPassword({ email: session.email, password: String(current ?? "") });
  if (check.error) return { ok: false, field: "current", error: "Your current password is not right." };
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) return { ok: false, error: "Could not change your password. Please try again." };

  await createAdminClient().from("im_audit_logs").insert({
    actor_id: session.user_id,
    actor_role: session.role,
    action: "changed_password",
    target: `profile:${session.user_id}`,
  });
  await createNotification({
    userId: session.user_id,
    type: "account",
    title: "Your password was changed",
    body: "If this was not you, reset your password from the sign-in page and contact us.",
    link: "/account/profile",
  });
  return { ok: true };
}

// --- Privacy (RA 10173) ------------------------------------------------------------

const PRIVACY_KINDS = ["access", "correction", "deletion", "objection"] as const;
type PrivacyKind = (typeof PRIVACY_KINDS)[number];

/**
 * A data-subject request (C-30): stored in im_privacy_requests, sent to the
 * admins as a task, and confirmed to the person by email.
 */
export async function submitPrivacyRequest(kind: string, details: string): Promise<AccountActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  if (!PRIVACY_KINDS.includes(kind as PrivacyKind)) return { ok: false, error: "Choose what you are asking for." };
  const text = String(details ?? "").trim().slice(0, 2000);
  if ((kind === "correction" || kind === "objection") && text.length < 5) {
    return { ok: false, error: "Tell us what to correct, or what you object to, in a sentence." };
  }
  const limited = await rateLimit("privacy_request", `user:${session.user_id}`, { limit: 3, windowSeconds: 86_400 });
  if (!limited.ok) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const db = createAdminClient();
  const { data, error } = await db
    .from("im_privacy_requests")
    .insert({ profile_id: session.user_id, kind, details: text || null })
    .select("id")
    .single();
  if (error || !data) {
    if (error && isMissingObject(error)) return { ok: false, error: "Privacy requests need database migration 0019. Please use the Contact page for now." };
    return { ok: false, error: "Could not send your request. Please try again." };
  }
  await db.from("im_audit_logs").insert({
    actor_id: session.user_id,
    actor_role: session.role,
    action: "privacy_request",
    target: `privacy_request:${data.id} ${kind}`,
  });
  await notifyAdmins({
    type: "account",
    title: `Privacy request #${data.id}: ${kind}`,
    body: `From ${session.name}. Respond within 15 days (RA 10173).`,
    link: "/admin/compliance#privacy",
  });
  await queueEmail("privacy_request", { email: session.email, name: session.name }, { name: session.name, kind, requestId: data.id });
  revalidatePath("/account/privacy");
  return { ok: true };
}

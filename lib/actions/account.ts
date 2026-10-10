"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { isMissingObject } from "@/lib/db-errors";
import { cleanUiPrefs, type UiPrefs } from "@/lib/a11y/prefs";

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

"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import type { Notification } from "@/lib/types";
import { groupsFor } from "@/lib/notification-types";
import { isMissingObject } from "@/lib/db-errors";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function getMyNotifications(limit = 20): Promise<Notification[]> {
  const session = await getSession();
  if (!session) return [];
  // A public endpoint: the browser chooses limit, so bound it (N-24).
  const n = Math.min(50, Math.max(1, Math.floor(Number(limit) || 20)));
  const db = createAdminClient();
  const { data } = await db
    .from("im_notifications")
    .select("*")
    .eq("user_id", session.user_id)
    .order("created_at", { ascending: false })
    .limit(n);
  return data ?? [];
}

export async function getMyUnreadCount(): Promise<number> {
  const session = await getSession();
  if (!session) return 0;
  const db = createAdminClient();
  const { count } = await db
    .from("im_notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", session.user_id)
    .eq("is_read", false);
  return count ?? 0;
}

export async function markNotificationRead(id: number): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in required." };
  const db = createAdminClient();
  const { error } = await db
    .from("im_notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("user_id", session.user_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in required." };
  const db = createAdminClient();
  const { error } = await db
    .from("im_notifications")
    .update({ is_read: true })
    .eq("user_id", session.user_id)
    .eq("is_read", false);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Turn one group of notifications on or off, in the app or by email (C-24).
 * The other channel keeps its current setting.
 */
export async function saveNotificationPref(
  groupKey: string,
  channel: "in_app" | "email",
  on: boolean
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in required." };
  if (channel !== "in_app" && channel !== "email") return { ok: false, error: "Unknown setting." };
  const group = groupsFor(session.role).find((g) => g.key === groupKey);
  if (!group) return { ok: false, error: "Unknown setting." };

  const db = createAdminClient();
  const { data: current, error: readErr } = await db
    .from("im_notification_prefs")
    .select("type, in_app, email")
    .eq("profile_id", session.user_id)
    .in("type", group.types);
  if (readErr) {
    if (isMissingObject(readErr)) return { ok: false, error: "Notification settings need database migration 0019." };
    return { ok: false, error: "Could not save the setting. Please try again." };
  }
  const byType = new Map(((current ?? []) as { type: string; in_app: boolean; email: boolean }[]).map((r) => [r.type, r]));
  const now = new Date().toISOString();
  const rows = group.types.map((type) => {
    const prev = byType.get(type) ?? { in_app: true, email: true };
    return {
      profile_id: session.user_id,
      type,
      in_app: channel === "in_app" ? Boolean(on) : prev.in_app,
      email: channel === "email" ? Boolean(on) : prev.email,
      updated_at: now,
    };
  });
  const { error } = await db.from("im_notification_prefs").upsert(rows, { onConflict: "profile_id,type" });
  if (error) return { ok: false, error: "Could not save the setting. Please try again." };
  revalidatePath("/account/notifications");
  return { ok: true };
}

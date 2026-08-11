"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import type { Notification, NotificationType } from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface NotifyInput {
  userId: number;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

// Internal helper — called directly from other server actions (shop.ts,
// seller.ts) after their own mutation succeeds. Not a client-facing action.
export async function createNotification(input: NotifyInput): Promise<void> {
  const db = createAdminClient();
  await db.from("im_notifications").insert({
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body || null,
    link: input.link || null,
  });
}

export async function getMyNotifications(limit = 20): Promise<Notification[]> {
  const session = await getSession();
  if (!session) return [];
  const db = createAdminClient();
  const { data } = await db
    .from("im_notifications")
    .select("*")
    .eq("user_id", session.user_id)
    .order("created_at", { ascending: false })
    .limit(limit);
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

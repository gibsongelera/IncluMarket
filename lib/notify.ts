import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { queueEmail, type EmailKind, type Recipient } from "@/lib/email/send";
import type { TemplateData } from "@/lib/email/templates";
import { REQUIRED_TYPES } from "@/lib/notification-types";
import type { NotificationType } from "@/lib/types";

/**
 * Per-type choices (im_notification_prefs, migration 0019). No row means the
 * default: on. Required types ignore the setting. Before 0019 there is no
 * table and everything is on.
 */
export async function wants(profileId: number, type: NotificationType, channel: "in_app" | "email"): Promise<boolean> {
  if (REQUIRED_TYPES.includes(type)) return true;
  const { data, error } = await createAdminClient()
    .from("im_notification_prefs")
    .select("in_app, email")
    .eq("profile_id", profileId)
    .eq("type", type)
    .maybeSingle();
  if (error || !data) return true;
  return Boolean((data as { in_app: boolean; email: boolean })[channel]);
}

/**
 * Email someone about an optional notification type, if they want it
 * (C-24). Receipts and account notices call queueEmail directly — they are
 * always sent.
 */
export async function emailIfWanted(
  profileId: number,
  type: NotificationType,
  kind: EmailKind,
  to: Recipient,
  data: TemplateData
): Promise<void> {
  if (!(await wants(profileId, type, "email"))) return;
  await queueEmail(kind, to, data);
}

export interface NotifyInput {
  userId: number;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

/**
 * Internal helper — called from server actions (shop, seller, messages) after
 * their own mutation succeeds.
 *
 * This deliberately lives OUTSIDE lib/actions/notifications.ts. Every export of
 * a `"use server"` module is a public, unauthenticated HTTP endpoint, no matter
 * what the surrounding comment claims. While this function was exported from
 * that module, anyone could POST its action id and insert a notification for
 * ANY user id with an attacker-chosen title, body and link — i.e. drop a
 * phishing link into any user's notification bell, and write unbounded rows.
 *
 * `import "server-only"` here makes the build fail if it is ever pulled into a
 * client bundle, and being a plain export (no "use server") means it is not
 * addressable from the network at all.
 */
export async function createNotification(input: NotifyInput): Promise<void> {
  if (!(await wants(input.userId, input.type, "in_app"))) return;
  const db = createAdminClient();
  await db.from("im_notifications").insert({
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body || null,
    link: input.link || null,
  });
}

/** One notification per active admin — moderation queues, refunds, flags. */
export async function notifyAdmins(input: Omit<NotifyInput, "userId">): Promise<void> {
  const db = createAdminClient();
  const { data: admins } = await db
    .from("im_profiles")
    .select("id")
    .eq("role", "admin")
    .eq("account_status", "active");
  if (!admins?.length) return;
  await db.from("im_notifications").insert(
    admins.map((a) => ({
      user_id: a.id,
      type: input.type,
      title: input.title,
      body: input.body || null,
      link: input.link || null,
    }))
  );
}

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationType } from "@/lib/types";

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
  const db = createAdminClient();
  await db.from("im_notifications").insert({
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body || null,
    link: input.link || null,
  });
}

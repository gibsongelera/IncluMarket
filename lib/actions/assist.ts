"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { clearAssistCookie, setAssistCookie } from "@/lib/assist/cookie";
import { ASSIST_REASON_MAX, ASSIST_REASON_MIN, cleanAssistReason } from "@/lib/assist/rules";
import { rateLimit } from "@/lib/security/rate-limit";
import { formatTime } from "@/lib/format";

/**
 * An admin assisting a seller (item 1 of the client's revision): AVRC staff
 * open a seller's Seller Centre and work in it for them — a seller who is
 * blind, say, at the AVRC office. getSession() then gives the admin the
 * seller's session with assistedBy set (lib/session.ts), so:
 *
 *  - listings, orders, messages and sales are the seller's, as if they had
 *    done it themselves, and listings still go through review;
 *  - every audit row names the admin, "for seller:<id>" (lib/assist/rules);
 *  - the seller's account settings, password, PWD ID, privacy requests,
 *    support tickets and payouts stay closed (ASSIST_CLOSED);
 *  - admin pages are closed until the admin stops, signs out, or two hours
 *    pass (lib/assist/token);
 *  - the seller is told in the app, whatever their notification settings.
 */

export interface AssistResult {
  ok: boolean;
  error?: string;
  sellerId?: number;
}

export async function startAssist(sellerId: number, reason: string): Promise<AssistResult> {
  const session = await getSession();
  if (session?.assistedBy) {
    return { ok: false, error: `You are already assisting ${session.name}. Stop assisting first.` };
  }
  if (!session || session.role !== "admin") return { ok: false, error: "Admin access required." };

  const id = Number(sellerId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Seller not found." };
  const why = cleanAssistReason(reason);
  if (!why) {
    return {
      ok: false,
      error: `Write why you are opening this shop, in ${ASSIST_REASON_MIN} to ${ASSIST_REASON_MAX} characters.`,
    };
  }

  const limited = await rateLimit("assist_start", `user:${session.user_id}`, { limit: 20, windowSeconds: 3600 });
  if (!limited.ok) return { ok: false, error: "You have opened many shops this hour. Please wait a few minutes." };

  const db = createAdminClient();
  const { data: seller } = await db
    .from("im_profiles")
    .select("id, role, name, account_status")
    .eq("id", id)
    .maybeSingle();
  if (!seller || seller.role !== "seller") return { ok: false, error: "Only a seller's shop can be opened this way." };
  if (seller.account_status !== "active") {
    return { ok: false, error: "This seller's account is not active. Restore it before opening their shop." };
  }

  // The cookie is signed for this sign-in, so it is worthless in any other.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const grant = await setAssistCookie(user.id, session.user_id, seller.id);
  if (!grant) return { ok: false, error: "Assisting a seller is not set up on this server." };

  await db.from("im_audit_logs").insert({
    actor_id: session.user_id,
    actor_role: "admin",
    action: "assist_started",
    // Quoted, so the admin's words can never read as "for seller:<id>".
    target: `seller:${seller.id} reason:"${why}"`,
  });

  // Straight into their notifications rather than through createNotification:
  // someone else working in their shop is not something they can switch off.
  const until = formatTime(new Date(grant.until * 1000).toISOString());
  const { error } = await db.from("im_notifications").insert({
    user_id: seller.id,
    type: "system",
    title: "AVRC staff opened your Seller Centre",
    body: `${session.name} is helping with your shop until ${until}. Everything they do is recorded under their name.`,
    link: "/seller/dashboard",
  });
  if (error) console.error(`[assist] notify seller: ${error.message}`);

  return { ok: true, sellerId: seller.id };
}

/** Back to the admin's own session. Safe to call when not assisting. */
export async function stopAssist(): Promise<AssistResult> {
  const session = await getSession();
  await clearAssistCookie();
  if (!session?.assistedBy) return { ok: true };
  await createAdminClient().from("im_audit_logs").insert({
    actor_id: session.assistedBy.user_id,
    actor_role: "admin",
    action: "assist_ended",
    target: `seller:${session.user_id}`,
  });
  return { ok: true, sellerId: session.user_id };
}

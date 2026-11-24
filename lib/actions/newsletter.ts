"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { ASSIST_CLOSED } from "@/lib/assist/rules";
import { guardByIp } from "@/lib/security/rate-limit";
import { isMissingObject } from "@/lib/db-errors";
import { queueEmail } from "@/lib/email/send";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** What the subscriber agreed to, stored with the subscription (C-42). */
const CONSENT_TEXT =
  "Email me about new PWD-made products and flash sales from InclusiveMarket. I can unsubscribe at any time.";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Subscribe, record consent, and send the welcome email with its unsubscribe link. */
async function subscribe(email: string, source: string): Promise<ActionResult> {
  const db = createAdminClient();
  const row = { email, source, subscribed_at: new Date().toISOString(), unsubscribed_at: null };
  let { error } = await db.from("im_newsletter_subscribers").upsert({ ...row, consent_text: CONSENT_TEXT }, { onConflict: "email" });
  if (error && isMissingObject(error)) {
    // Before migration 0019: no consent or token columns yet.
    ({ error } = await db.from("im_newsletter_subscribers").upsert(row, { onConflict: "email" }));
  }
  if (error) return { ok: false, error: "Could not subscribe you right now. Please try again." };

  const { data } = await db.from("im_newsletter_subscribers").select("unsubscribe_token").eq("email", email).maybeSingle();
  await queueEmail("newsletter_welcome", { email }, { unsubscribeToken: (data as { unsubscribe_token?: string } | null)?.unsubscribe_token });
  return { ok: true };
}

export async function subscribeNewsletter(email: string): Promise<ActionResult> {
  const clean = String(email ?? "").trim().toLowerCase();
  if (!isValidEmail(clean) || clean.length > 254) return { ok: false, error: "Enter a valid email address." };

  // Unauthenticated: limit by network so the list cannot be flooded.
  const guard = await guardByIp("newsletter", { limit: 5, windowSeconds: 3600 });
  if (guard) return guard;
  return subscribe(clean, "footer");
}

/**
 * The unsubscribe link (C-42). The token is the subscriber's own random
 * value; the page asks for a click first, so mail scanners that open links
 * do not unsubscribe anyone.
 */
export async function unsubscribeNewsletter(token: string): Promise<ActionResult> {
  const t = String(token ?? "");
  if (!/^[A-Za-z0-9]{16,64}$/.test(t)) return { ok: false, error: "This unsubscribe link is not valid." };
  const guard = await guardByIp("newsletter_unsubscribe", { limit: 20, windowSeconds: 3600 });
  if (guard) return guard;
  const { data, error } = await createAdminClient()
    .from("im_newsletter_subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("unsubscribe_token", t)
    .is("unsubscribed_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Could not unsubscribe you right now. Please try again." };
  if (!data) return { ok: true }; // already unsubscribed, or an old link: same outcome for the person
  return { ok: true };
}

/** Account → Privacy: newsletter on or off for the signed-in person's own address. */
export async function setMyNewsletter(on: boolean): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  if (session.assistedBy) return { ok: false, error: ASSIST_CLOSED };
  const email = session.email.trim().toLowerCase();
  if (on) {
    const res = await subscribe(email, "account");
    if (res.ok) revalidatePath("/account/privacy");
    return res;
  }
  const { error } = await createAdminClient()
    .from("im_newsletter_subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("email", email)
    .is("unsubscribed_at", null);
  if (error) return { ok: false, error: "Could not update the setting. Please try again." };
  revalidatePath("/account/privacy");
  return { ok: true };
}

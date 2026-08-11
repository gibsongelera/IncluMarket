"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function subscribeNewsletter(email: string): Promise<ActionResult> {
  const clean = email.trim().toLowerCase();
  if (!isValidEmail(clean)) return { ok: false, error: "Enter a valid email address." };

  const db = createAdminClient();
  const { error } = await db
    .from("im_newsletter_subscribers")
    .upsert(
      { email: clean, source: "footer", subscribed_at: new Date().toISOString(), unsubscribed_at: null },
      { onConflict: "email" }
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { isMissingObject } from "@/lib/db-errors";

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

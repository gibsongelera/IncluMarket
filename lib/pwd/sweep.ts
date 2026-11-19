import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";
import { getPwdSettings } from "@/lib/settings";
import { daysUntil, manilaToday } from "./id-number";
import { tellUserAboutVerification } from "./notify";

/**
 * Time-based upkeep for PWD verification. There is no scheduler on this
 * deployment (Q17), so this runs from the pages that care — the admin queue
 * and the account pages — and is throttled through im_rate_limits to once
 * every ten minutes across all instances.
 *
 *   1. Expiry: an approval past its ID's expiry date becomes "expired" and
 *      the person is told. (im_verified_pwd already stops counting it on the
 *      day itself; this makes the status say so.)
 *   2. Reminder: once, N days before expiry (pwd_renewal_reminder_days),
 *      unless a renewal is already waiting.
 *   3. Retention: ID photos are deleted pwd_id_retention_days after the
 *      decision. The record keeps the status, last four digits, expiry,
 *      reviewer and dates. The sealed full number is wiped at the decision;
 *      this also clears any copy a decided row might still hold.
 *
 * Never throws: upkeep must not break the page that triggered it.
 */
export async function sweepPwdVerifications(): Promise<void> {
  try {
    const gate = await rateLimit("sweep_pwd_verifications", "global", { limit: 1, windowSeconds: 600 });
    if (!gate.ok) return;

    const db = createAdminClient();
    const settings = await getPwdSettings();
    const today = manilaToday();
    const now = new Date().toISOString();

    // 1. Expiry
    const { data: expired, error: expErr } = await db
      .from("im_pwd_verifications")
      .update({ status: "expired", updated_at: now })
      .eq("status", "approved")
      .lt("expires_on", today)
      .select("id, profile_id");
    if (expErr) return; // before migration 0017, or the database is unwell
    for (const row of (expired ?? []) as { id: number; profile_id: number }[]) {
      await tellUserAboutVerification(row.profile_id, "expired");
    }

    // 2. Renewal reminder
    const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + settings.pwd_renewal_reminder_days * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const { data: soon } = await db
      .from("im_pwd_verifications")
      .select("id, profile_id, expires_on")
      .eq("status", "approved")
      .is("reminder_sent_at", null)
      .gte("expires_on", today)
      .lte("expires_on", horizon)
      .limit(100);
    const soonRows = (soon ?? []) as { id: number; profile_id: number; expires_on: string }[];
    if (soonRows.length) {
      const { data: waiting } = await db
        .from("im_pwd_verifications")
        .select("profile_id")
        .eq("status", "submitted")
        .in("profile_id", soonRows.map((r) => r.profile_id));
      const renewing = new Set(((waiting ?? []) as { profile_id: number }[]).map((r) => r.profile_id));
      for (const row of soonRows) {
        // Claim the reminder first, so two overlapping sweeps send it once.
        const { data: claimed } = await db
          .from("im_pwd_verifications")
          .update({ reminder_sent_at: now })
          .eq("id", row.id)
          .is("reminder_sent_at", null)
          .select("id")
          .maybeSingle();
        if (!claimed || renewing.has(row.profile_id)) continue;
        await tellUserAboutVerification(row.profile_id, "reminder", {
          expiresOn: row.expires_on,
          days: daysUntil(row.expires_on, today),
        });
      }
    }

    // 3. Retention
    const cutoff = new Date(Date.now() - settings.pwd_id_retention_days * 86_400_000).toISOString();
    const { data: old } = await db
      .from("im_pwd_verifications")
      .select("id, front_path, back_path, selfie_path")
      .in("status", ["approved", "rejected", "revoked", "expired"])
      .is("images_deleted_at", null)
      .not("front_path", "is", null)
      .lt("reviewed_at", cutoff)
      .limit(50);
    for (const row of (old ?? []) as { id: number; front_path: string | null; back_path: string | null; selfie_path: string | null }[]) {
      const paths = [row.front_path, row.back_path, row.selfie_path].filter((p): p is string => Boolean(p));
      const { error } = await db.storage.from("pwd-ids").remove(paths);
      if (error) {
        console.error(`[pwd] retention remove ${row.id}: ${error.message}`);
        continue;
      }
      await db
        .from("im_pwd_verifications")
        .update({ front_path: null, back_path: null, selfie_path: null, images_deleted_at: now, id_number_encrypted: null })
        .eq("id", row.id);
      await db
        .from("im_audit_logs")
        .insert({ actor_id: null, actor_role: "system", action: "pwd_images_deleted", target: `verification:${row.id}` });
    }

    // Defensive: no decided row keeps the sealed number.
    await db
      .from("im_pwd_verifications")
      .update({ id_number_encrypted: null })
      .neq("status", "submitted")
      .not("id_number_encrypted", "is", null);
  } catch (err) {
    console.error("[pwd] sweep failed:", err);
  }
}

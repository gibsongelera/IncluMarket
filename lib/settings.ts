import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Values the client has not confirmed (retention, grace period, review
 * turnaround) live in im_settings (migration 0014) so they can change without
 * a deploy. Every read has a fallback: before the migration, or if the read
 * fails, the documented default applies.
 */
export async function getSettingInts<K extends string>(defaults: Record<K, number>): Promise<Record<K, number>> {
  const out = { ...defaults };
  try {
    const { data, error } = await createAdminClient()
      .from("im_settings")
      .select("key, value")
      .in("key", Object.keys(defaults));
    if (error || !data) return out;
    for (const row of data as { key: K; value: string }[]) {
      const n = Number.parseInt(String(row.value), 10);
      if (Number.isFinite(n) && row.key in out) out[row.key] = n;
    }
  } catch {
    // Defaults stand.
  }
  return out;
}

export const PWD_SETTING_DEFAULTS = {
  pwd_id_retention_days: 30,
  seller_verification_grace_days: 30,
  pwd_review_target_days: 2,
  pwd_renewal_reminder_days: 30,
};

export type PwdSettings = typeof PWD_SETTING_DEFAULTS;

export function getPwdSettings(): Promise<PwdSettings> {
  return getSettingInts(PWD_SETTING_DEFAULTS);
}

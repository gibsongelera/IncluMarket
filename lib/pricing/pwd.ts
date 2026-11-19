import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { PwdContext, PwdRule } from "./core";

type Db = ReturnType<typeof createAdminClient>;

interface RuleRow {
  id: number;
  rule_type: PwdRule["type"];
  rate_percent: number | string;
  vat_exempt: boolean;
  weekly_purchase_cap: number | string | null;
  legal_basis: string;
  funded_by: PwdRule["fundedBy"];
  category_id: string | null;
  product_id: number | null;
}

/**
 * PWD discount context for a buyer (C-26): the rules that are switched on,
 * the buyer's approved, unexpired verification (im_verified_pwd — so a
 * revoked or expired verification loses the discount on the next request),
 * and how much of each capped rule they already used this week.
 *
 * Returns null — no discount and no prompt anywhere — before migrations
 * 0017/0018, or while no rule is enabled. Every rule ships disabled, and the
 * database refuses to enable one without a recorded legal sign-off.
 */
export async function loadPwdContext(db: Db, buyerId: number): Promise<PwdContext | null> {
  const { data: ruleRows, error } = await db
    .from("im_discount_rules")
    .select("id, rule_type, rate_percent, vat_exempt, weekly_purchase_cap, legal_basis, funded_by, category_id, product_id")
    .eq("enabled", true);
  if (error || !ruleRows?.length) return null;

  const rules: PwdRule[] = (ruleRows as RuleRow[]).map((r) => ({
    id: Number(r.id),
    type: r.rule_type,
    ratePercent: Number(r.rate_percent),
    vatExempt: Boolean(r.vat_exempt),
    weeklyPurchaseCap: r.weekly_purchase_cap == null ? null : Number(r.weekly_purchase_cap),
    legalBasis: r.legal_basis,
    fundedBy: r.funded_by,
    categoryId: r.category_id,
    productId: r.product_id == null ? null : Number(r.product_id),
  }));

  const { data: verified } = await db
    .from("im_verified_pwd")
    .select("verification_id")
    .eq("profile_id", buyerId)
    .maybeSingle();
  const verificationId = (verified as { verification_id: number } | null)?.verification_id ?? null;

  const weeklyUsed: Record<number, number> = {};
  if (verificationId && rules.some((r) => r.weeklyPurchaseCap != null)) {
    const { data: usage } = await db.rpc("im_pwd_weekly_usage", { p_buyer: buyerId });
    for (const u of (usage ?? []) as { rule_id: number; used: number | string }[]) {
      weeklyUsed[Number(u.rule_id)] = Number(u.used);
    }
  }

  return { verificationId: verificationId ? Number(verificationId) : null, rules, weeklyUsed };
}

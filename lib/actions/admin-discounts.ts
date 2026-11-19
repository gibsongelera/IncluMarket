"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { isMissingObject } from "@/lib/db-errors";
import { boundedText } from "@/lib/validation/data-url";

/**
 * Admin → Discounts (C-26). PWD discount rules are configuration: the
 * lawyer's answer becomes rows, not code. Every rule is created OFF; turning
 * one on records who confirmed legal sign-off, when, and their note — the
 * database refuses an enabled rule without it (migration 0018). Each change
 * is audited. Public endpoints: each checks for an admin session first.
 */

export interface DiscountActionResult {
  ok: boolean;
  error?: string;
}

export interface DiscountRuleInput {
  name: string;
  ruleType: "statutory_20" | "bnpc_5" | "voluntary";
  ratePercent?: number;
  vatExempt?: boolean;
  weeklyPurchaseCap?: number | null;
  categoryId?: string | null;
  productId?: number | null;
  fundedBy: "seller" | "platform";
  legalBasis: string;
}

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

async function audit(actorId: number, action: string, target: string) {
  await createAdminClient().from("im_audit_logs").insert({ actor_id: actorId, actor_role: "admin", action, target });
}

function done() {
  revalidatePath("/admin/discounts");
  revalidatePath("/buyer/cart");
  revalidatePath("/buyer/checkout");
}

export async function createDiscountRule(input: DiscountRuleInput): Promise<DiscountActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };

  const name = boundedText(input?.name ?? "", 120);
  if (!name || name.length < 3) return { ok: false, error: "Give the rule a name (3 characters or more)." };
  const type = input?.ruleType;
  if (type !== "statutory_20" && type !== "bnpc_5" && type !== "voluntary") return { ok: false, error: "Choose a rule type." };
  const legalBasis = boundedText(input?.legalBasis ?? "", 300);
  if (!legalBasis || legalBasis.length < 3) {
    return { ok: false, error: "State the legal basis (for example RA 10754, DTI-DA JMC 01-2022, or Voluntary promo)." };
  }
  const fundedBy = input?.fundedBy === "platform" ? "platform" : "seller";

  // The shape each type must have — the same rules as the table constraints.
  let rate = Number(input?.ratePercent);
  let cap: number | null = input?.weeklyPurchaseCap == null || String(input.weeklyPurchaseCap) === "" ? null : Number(input.weeklyPurchaseCap);
  let vat = Boolean(input?.vatExempt);
  if (type === "statutory_20") {
    rate = 20;
    cap = null;
  } else if (type === "bnpc_5") {
    rate = 5;
    vat = false;
    if (!cap || !Number.isFinite(cap) || cap <= 0) return { ok: false, error: "A BNPC rule needs a weekly purchase limit (₱1,300 under JMC 01-2022)." };
  } else {
    vat = false;
    if (!Number.isFinite(rate) || rate <= 0 || rate > 50) return { ok: false, error: "A voluntary discount is between 1% and 50%." };
    if (cap !== null && (!Number.isFinite(cap) || cap <= 0)) return { ok: false, error: "The weekly limit must be more than ₱0, or empty." };
  }

  const categoryId = input?.categoryId ? String(input.categoryId).slice(0, 40) : null;
  const productId = input?.productId ? Math.floor(Number(input.productId)) : null;
  if (Boolean(categoryId) === Boolean(productId)) return { ok: false, error: "Apply the rule to one category or one product." };

  const db = createAdminClient();
  if (productId) {
    const { data: p } = await db.from("im_products").select("id").eq("id", productId).maybeSingle();
    if (!p) return { ok: false, error: `There is no product #${productId}.` };
  }
  const { data, error } = await db
    .from("im_discount_rules")
    .insert({
      name,
      rule_type: type,
      rate_percent: rate,
      vat_exempt: vat,
      weekly_purchase_cap: cap,
      category_id: categoryId,
      product_id: productId,
      funded_by: fundedBy,
      legal_basis: legalBasis,
      enabled: false,
      created_by: admin.user_id,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error && isMissingObject(error)) return { ok: false, error: "Discount rules need database migration 0018." };
    return { ok: false, error: "Could not create the rule. Check the fields and try again." };
  }
  await audit(admin.user_id, "discount_rule_created", `discount:${data.id} ${type} ${rate}%`);
  done();
  return { ok: true };
}

/** Turn a rule on. Requires the legal sign-off note; recorded on the rule and in the audit log. */
export async function enableDiscountRule(ruleId: number, signoffNote: string): Promise<DiscountActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const note = boundedText(signoffNote ?? "", 500);
  if (!note || note.length < 5) {
    return { ok: false, error: "Record the legal sign-off: who confirmed it, when, and any reference." };
  }
  const { data, error } = await createAdminClient()
    .from("im_discount_rules")
    .update({
      enabled: true,
      legal_signoff_by: admin.user_id,
      legal_signoff_at: new Date().toISOString(),
      legal_signoff_note: note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", Number(ruleId))
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Another rule is already on for the same category or product. Turn that one off first." };
    return { ok: false, error: "Could not turn the rule on. Please try again." };
  }
  if (!data) return { ok: false, error: "That rule no longer exists." };
  await audit(admin.user_id, "discount_rule_enabled", `discount:${ruleId} signoff:${note}`);
  done();
  return { ok: true };
}

export async function disableDiscountRule(ruleId: number): Promise<DiscountActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const { error } = await createAdminClient()
    .from("im_discount_rules")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("id", Number(ruleId));
  if (error) return { ok: false, error: "Could not turn the rule off. Please try again." };
  await audit(admin.user_id, "discount_rule_disabled", `discount:${ruleId}`);
  done();
  return { ok: true };
}

/** Delete a rule that is off and was never used on an order (used rules are kept as evidence). */
export async function deleteDiscountRule(ruleId: number): Promise<DiscountActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const db = createAdminClient();
  const { data: rule } = await db.from("im_discount_rules").select("enabled").eq("id", Number(ruleId)).maybeSingle();
  if (!rule) return { ok: false, error: "That rule no longer exists." };
  if (rule.enabled) return { ok: false, error: "Turn the rule off before deleting it." };
  const { count } = await db
    .from("im_order_items")
    .select("id", { count: "exact", head: true })
    .eq("pwd_rule_id", Number(ruleId));
  if (count) return { ok: false, error: "This rule discounted past orders, so it is kept as a record. Leave it off instead." };
  const { error } = await db.from("im_discount_rules").delete().eq("id", Number(ruleId));
  if (error) return { ok: false, error: "Could not delete the rule. Please try again." };
  await audit(admin.user_id, "discount_rule_deleted", `discount:${ruleId}`);
  done();
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { isMissingObject } from "@/lib/db-errors";
import { boundedText } from "@/lib/validation/data-url";
import { createNotification, notifyAdmins } from "@/lib/notify";
import { money } from "@/lib/format";

/**
 * Payouts (C-35). A seller asks for (part of) their available balance; an
 * admin approves or rejects, then marks it paid with the transfer
 * reference. The database refuses a request above the available balance
 * (im_request_payout locks the seller, so two at once cannot both pass).
 * Every step is audited and the seller is told in the app.
 */

export interface PayoutResult {
  ok: boolean;
  error?: string;
}

const METHODS = ["gcash", "maya", "bank"] as const;

async function audit(actorId: number, role: string, action: string, target: string) {
  await createAdminClient().from("im_audit_logs").insert({ actor_id: actorId, actor_role: role, action, target });
}

function done() {
  revalidatePath("/seller/finance");
  revalidatePath("/admin/payouts");
}

export async function requestPayout(input: {
  amount: number;
  method: string;
  account: string;
  note?: string;
}): Promise<PayoutResult> {
  const session = await getSession();
  if (!session || session.role !== "seller") return { ok: false, error: "Seller access required." };
  const amount = Math.round(Number(input?.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter the amount to withdraw." };
  const method = String(input?.method ?? "");
  if (!METHODS.includes(method as (typeof METHODS)[number])) return { ok: false, error: "Choose GCash, Maya or bank transfer." };
  const account = String(input?.account ?? "").replace(/[\s-]/g, "");
  if ((method === "gcash" || method === "maya") && !/^(\+?63|0)9\d{9}$/.test(account)) {
    return { ok: false, error: "Enter the GCash or Maya mobile number, for example 09171234567." };
  }
  if (method === "bank" && !/^\d{6,20}$/.test(account)) return { ok: false, error: "Enter the bank account number (digits only)." };

  const db = createAdminClient();
  const { data: id, error } = await db.rpc("im_request_payout", {
    p_seller: session.user_id,
    p_amount: amount,
    p_method: method,
    p_account: account,
    p_note: boundedText(input?.note ?? "", 300),
  });
  if (error) {
    if (isMissingObject(error)) return { ok: false, error: "Payouts need database migration 0020." };
    if (/below_minimum/.test(error.message)) return { ok: false, error: "That is below the smallest payout. See the minimum above." };
    if (/insufficient_balance/.test(error.message)) return { ok: false, error: "That is more than your available balance." };
    return { ok: false, error: "Could not send your request. Please try again." };
  }
  await audit(session.user_id, "seller", "payout_requested", `payout:${id} amount:${amount}`);
  await notifyAdmins({
    type: "payout",
    title: `Payout request: ${money(amount)}`,
    body: `${session.name} asked for a ${method === "bank" ? "bank transfer" : method.toUpperCase()} payout.`,
    link: "/admin/payouts",
  });
  done();
  return { ok: true };
}

/** A seller withdraws a request nobody has acted on yet. */
export async function cancelPayoutRequest(payoutId: number): Promise<PayoutResult> {
  const session = await getSession();
  if (!session || session.role !== "seller") return { ok: false, error: "Seller access required." };
  const { data, error } = await createAdminClient()
    .from("im_payouts")
    .update({ status: "rejected", note: "Cancelled by the seller.", updated_at: new Date().toISOString() })
    .eq("id", Number(payoutId))
    .eq("seller_id", session.user_id)
    .eq("status", "requested")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Could not cancel it. Please try again." };
  if (!data) return { ok: false, error: "Only a request that is still waiting can be cancelled." };
  await audit(session.user_id, "seller", "payout_cancelled", `payout:${payoutId}`);
  done();
  return { ok: true };
}

async function adminMove(
  payoutId: number,
  from: string[],
  patch: Record<string, unknown>,
  notice: (amount: number) => { title: string; body: string },
  action: string
): Promise<PayoutResult> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "Admin access required." };
  const db = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("im_payouts")
    .update({ ...patch, processed_by: session.user_id, updated_at: now })
    .eq("id", Number(payoutId))
    .in("status", from)
    .select("id, seller_id, amount")
    .maybeSingle();
  if (error) {
    if (isMissingObject(error)) return { ok: false, error: "Payouts need database migration 0020." };
    return { ok: false, error: "Could not update the payout. Please try again." };
  }
  if (!data) return { ok: false, error: "Someone already acted on this payout. The list has been refreshed." };
  await audit(session.user_id, "admin", action, `payout:${payoutId}`);
  const n = notice(Number(data.amount));
  await createNotification({ userId: data.seller_id, type: "payout", title: n.title, body: n.body, link: "/seller/finance" });
  done();
  return { ok: true };
}

export async function approvePayout(payoutId: number): Promise<PayoutResult> {
  return adminMove(
    payoutId,
    ["requested"],
    { status: "approved", decided_at: new Date().toISOString() },
    (a) => ({ title: `Payout of ${money(a)} approved`, body: "We will send it and tell you when it is paid." }),
    "payout_approved"
  );
}

export async function rejectPayout(payoutId: number, reason: string): Promise<PayoutResult> {
  const why = boundedText(reason ?? "", 300);
  if (!why || why.length < 5) return { ok: false, error: "Tell the seller why, in a sentence." };
  return adminMove(
    payoutId,
    ["requested", "approved"],
    { status: "rejected", note: why, decided_at: new Date().toISOString() },
    (a) => ({ title: `Payout of ${money(a)} not sent`, body: `Reason: ${why}. The amount is back in your available balance.` }),
    "payout_rejected"
  );
}

export async function markPayoutPaid(payoutId: number, reference: string): Promise<PayoutResult> {
  const ref = boundedText(reference ?? "", 120);
  if (!ref || ref.length < 3) return { ok: false, error: "Enter the transfer reference number." };
  return adminMove(
    payoutId,
    ["approved"],
    { status: "paid", reference: ref, paid_at: new Date().toISOString() },
    (a) => ({ title: `Payout of ${money(a)} sent`, body: `Reference: ${ref}.` }),
    "payout_paid"
  );
}

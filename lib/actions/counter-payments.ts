"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { createNotification, notifyAdmins } from "@/lib/notify";
import { signPrivateImages, storePrivateImage } from "@/lib/media";
import { rateLimit } from "@/lib/security/rate-limit";
import { boundedText } from "@/lib/validation/data-url";
import { isMissingObject } from "@/lib/db-errors";
import { applyCheckoutPayment } from "@/lib/payments/apply";
import { getCounterAccounts } from "@/lib/counter-payments";
import { money } from "@/lib/format";
import { channelLabel, cleanAccountNumber, cleanAmount, cleanReference, isCounterChannel } from "@/lib/counter-channels";

/**
 * Paying the Workshop over the counter (migration 0028). A buyer sends the
 * reference number of their GCash, Maribank or LandBank payment, and a photo
 * of the receipt if they have one; an admin compares it with the Workshop's
 * account and confirms it, which settles the checkout exactly as an online
 * payment does (lib/payments/apply.ts); and admins set the accounts buyers
 * pay into. Every export here is a public endpoint: each one checks who is
 * calling before it reads anything.
 */

export interface CounterActionResult {
  ok: boolean;
  error?: string;
}

const MIGRATION = "This needs database migration 0028 (supabase/migrations/0028_counter_payments.sql).";

async function audit(actorId: number, actorRole: string, action: string, target: string) {
  await createAdminClient().from("im_audit_logs").insert({ actor_id: actorId, actor_role: actorRole, action, target });
}

/** A step on every order of the checkout that is still waiting, so sellers see it and the hold restarts. */
async function noteOnOrders(checkoutId: number, note: string, actorId: number, actorRole: string) {
  const db = createAdminClient();
  const { data: orders } = await db
    .from("im_orders")
    .select("id")
    .eq("checkout_id", checkoutId)
    .eq("order_status", "pending");
  if (!orders?.length) return;
  await db
    .from("im_order_status_history")
    .insert(orders.map((o) => ({ order_id: o.id, status: "pending", note, created_by: actorId, actor_role: actorRole })));
}

function refresh(checkoutId: number) {
  revalidatePath(`/buyer/pay/${checkoutId}`);
  revalidatePath("/buyer/orders");
  revalidatePath("/seller/orders");
  revalidatePath("/admin/payments");
  revalidatePath("/admin");
}

/**
 * The buyer says they paid: how (channel), the reference number on the
 * receipt, the amount sent, and optionally a photo of the receipt
 * (`receipt`, resized in the browser, 1 MB at most). One proof waits for
 * review per checkout, and a reference number can pay only once.
 */
export async function submitPaymentProof(form: FormData): Promise<CounterActionResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer") return { ok: false, error: "Please sign in again." };

  const checkoutId = Number(form.get("checkoutId"));
  if (!Number.isInteger(checkoutId) || checkoutId <= 0) return { ok: false, error: "We could not find that order." };
  const channel = form.get("channel");
  if (!isCounterChannel(channel)) return { ok: false, error: "Choose how you paid." };
  const reference = cleanReference(form.get("reference"));
  if (!reference) {
    return {
      ok: false,
      error: "Enter the reference number as it appears on your receipt: 4 to 40 letters, numbers or dashes.",
    };
  }
  const amount = cleanAmount(form.get("amount"));
  if (amount === null) return { ok: false, error: "Enter the amount you sent, for example 350 or 1,250.50." };

  const gate = await rateLimit("payment_proof", String(session.user_id), { limit: 8, windowSeconds: 3600 });
  if (!gate.ok) return { ok: false, error: "Too many tries. Please wait a while, then send it again." };

  const db = createAdminClient();
  const { data: ck, error: ckErr } = await db
    .from("im_checkouts")
    .select("id, payment_provider, payment_status")
    .eq("id", checkoutId)
    .eq("buyer_id", session.user_id)
    .maybeSingle();
  if (ckErr || !ck || ck.payment_provider !== "otc") return { ok: false, error: "We could not find that order." };
  if (ck.payment_status === "paid") return { ok: false, error: "This order is already paid. Thank you!" };

  // A channel the Workshop has an account for. One switched off since the
  // buyer paid still counts: the money may already be there.
  let accounts;
  try {
    accounts = await getCounterAccounts({}, db);
  } catch {
    return { ok: false, error: "We could not reach the shop. Please try again." };
  }
  if (accounts === null) return { ok: false, error: "Paying the Workshop is not available yet." };
  if (!accounts.some((a) => a.channel === channel)) {
    return { ok: false, error: `The Workshop has no ${channelLabel(channel)} account. Choose the one you paid into.` };
  }

  let receiptPath: string | null = null;
  const file = form.get("receipt");
  if (file instanceof File && file.size > 0) {
    const stored = await storePrivateImage("payment-proofs", checkoutId, file);
    if (!stored.ok) {
      return {
        ok: false,
        error: stored.missing ? "Receipt photos are not switched on yet. Send the reference number without one." : stored.error,
      };
    }
    receiptPath = stored.path;
  }

  const { data: proof, error } = await db
    .from("im_payment_proofs")
    .insert({ checkout_id: checkoutId, buyer_id: session.user_id, channel, reference, amount, receipt_path: receiptPath })
    .select("id")
    .single();
  if (error || !proof) {
    if (receiptPath) await db.storage.from("payment-proofs").remove([receiptPath]);
    if ((error as { code?: string } | null)?.code === "23505") {
      return /reference/.test(error?.message ?? "")
        ? { ok: false, error: "That reference number was already sent. Check the number on your receipt." }
        : { ok: false, error: "We are already checking a payment for this order. We will tell you as soon as it is done." };
    }
    if (isMissingObject(error)) return { ok: false, error: "Paying the Workshop is not available yet." };
    console.error("[counter-payments] proof insert:", error?.message);
    return { ok: false, error: "We could not send it. Please try again." };
  }

  await noteOnOrders(checkoutId, "The buyer sent their payment details. The Workshop is checking them.", session.user_id, "buyer");
  await audit(session.user_id, "buyer", "sent_payment_proof", `checkout:${checkoutId} proof:${proof.id}`);
  await notifyAdmins({
    type: "system",
    title: `Payment to check: ${money(amount)} by ${channelLabel(channel)}`,
    body: `Checkout #${checkoutId}. Find it in the Workshop's ${channelLabel(channel)} account, then confirm it or say it did not arrive.`,
    link: "/admin/payments#to-check",
  });
  refresh(checkoutId);
  return { ok: true };
}

/**
 * An admin's decision on what a buyer sent. Confirming settles every order
 * of the checkout (the payment's idempotency key is the proof, so a retry is
 * harmless); orders already cancelled are flagged for a refund instead.
 * Refusing needs a reason the buyer reads, and frees the reference number.
 */
export async function reviewPaymentProof(
  proofId: number,
  decision: "approve" | "reject",
  note?: string
): Promise<CounterActionResult> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "Only an admin can do this." };
  const id = Number(proofId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "We could not find that payment." };
  if (decision !== "approve" && decision !== "reject") return { ok: false, error: "Choose confirm or not received." };
  const why = boundedText(note, 500);
  if (decision === "reject" && (!why || why.length < 5)) {
    return { ok: false, error: "Tell the buyer what is wrong, for example that no payment with that reference arrived." };
  }

  const db = createAdminClient();
  const { data: proof, error } = await db
    .from("im_payment_proofs")
    .update({
      status: decision === "approve" ? "approved" : "rejected",
      review_note: why,
      reviewed_by: session.user_id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "submitted")
    .select("id, checkout_id, buyer_id, channel, reference, amount")
    .maybeSingle();
  if (error) {
    if (isMissingObject(error)) return { ok: false, error: MIGRATION };
    console.error("[counter-payments] review:", error.message);
    return { ok: false, error: "Could not save that. Please try again." };
  }
  if (!proof) return { ok: false, error: "This payment was already decided. Reload the page to see it." };
  const label = channelLabel(proof.channel);

  if (decision === "approve") {
    const res = await applyCheckoutPayment({
      checkoutId: proof.checkout_id,
      outcome: "paid",
      reference: `${proof.channel}:${proof.reference}`,
      eventId: `otc-proof:${proof.id}`,
      providerId: "otc",
    });
    if (!res.ok) {
      // Back in the queue, so it can be confirmed again.
      await db
        .from("im_payment_proofs")
        .update({ status: "submitted", review_note: null, reviewed_by: null, reviewed_at: null })
        .eq("id", proof.id);
      console.error("[counter-payments] apply:", res.error);
      return { ok: false, error: "The payment could not be applied to the orders. Please try again." };
    }
    await audit(
      session.user_id,
      "admin",
      "confirmed_counter_payment",
      `checkout:${proof.checkout_id} proof:${proof.id} ${label} ${proof.reference} ${money(Number(proof.amount))}`
    );
  } else {
    await noteOnOrders(proof.checkout_id, `The Workshop could not confirm the payment: ${why}`, session.user_id, "admin");
    await createNotification({
      userId: proof.buyer_id,
      type: "order_status",
      title: "We could not confirm your payment",
      body: `${why} Please check the details on your receipt and send them again.`,
      link: `/buyer/pay/${proof.checkout_id}`,
    });
    await audit(session.user_id, "admin", "refused_counter_payment", `checkout:${proof.checkout_id} proof:${proof.id} ${label} ${proof.reference}`);
  }
  refresh(proof.checkout_id);
  return { ok: true };
}

/** A short-lived link to a receipt photo, for an admin checking it. */
export async function getReceiptLink(proofId: number): Promise<{ ok: boolean; error?: string; url?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "Only an admin can see receipts." };
  const id = Number(proofId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "We could not find that payment." };
  const { data, error } = await createAdminClient().from("im_payment_proofs").select("receipt_path").eq("id", id).maybeSingle();
  if (error || !data?.receipt_path) return { ok: false, error: "This payment has no receipt photo." };
  const signed = await signPrivateImages("payment-proofs", [data.receipt_path], 60);
  const url = signed[data.receipt_path];
  return url ? { ok: true, url } : { ok: false, error: "The receipt photo could not be opened. Please try again." };
}

export interface CounterAccountInput {
  channel: string;
  accountName: string;
  accountNumber: string;
  instructions?: string;
  active: boolean;
}

/**
 * The accounts buyers pay the Workshop into. A row left blank is removed.
 * Where buyers send money is the most sensitive thing an admin sets, so
 * every change is in the audit log and every other admin is told.
 */
export async function saveCounterAccounts(input: CounterAccountInput[]): Promise<CounterActionResult> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "Only an admin can do this." };
  if (!Array.isArray(input) || input.length === 0 || input.length > 3) return { ok: false, error: "Nothing to save." };

  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  const cleared: string[] = [];
  const seen = new Set<string>();
  for (const a of input) {
    if (!isCounterChannel(a?.channel) || seen.has(a.channel)) return { ok: false, error: "Something in the form is not right. Reload the page." };
    seen.add(a.channel);
    const label = channelLabel(a.channel);
    const name = boundedText(a.accountName, 120);
    const rawNumber = typeof a.accountNumber === "string" ? a.accountNumber.trim() : "";
    if (!name && !rawNumber) {
      if (a.active) return { ok: false, error: `Enter the ${label} account name and number, or switch it off.` };
      cleared.push(a.channel);
      continue;
    }
    if (!name || name.length < 2) return { ok: false, error: `Enter the name on the ${label} account.` };
    const number = cleanAccountNumber(rawNumber);
    if (!number) return { ok: false, error: `The ${label} account number can only have digits, letters, spaces and dashes (4 to 40).` };
    rows.push({
      channel: a.channel,
      account_name: name,
      account_number: number,
      instructions: boundedText(a.instructions, 500),
      active: a.active === true,
      updated_by: session.user_id,
      updated_at: now,
    });
  }

  const db = createAdminClient();
  let before;
  try {
    before = await getCounterAccounts({}, db);
  } catch {
    return { ok: false, error: "We could not reach the shop. Please try again." };
  }
  if (before === null) return { ok: false, error: MIGRATION };

  if (rows.length) {
    const { error } = await db.from("im_payment_accounts").upsert(rows, { onConflict: "channel" });
    if (error) {
      console.error("[counter-payments] accounts:", error.message);
      return { ok: false, error: "Could not save the accounts. Please try again." };
    }
  }
  if (cleared.length) await db.from("im_payment_accounts").delete().in("channel", cleared);

  const old = new Map(before.map((a) => [a.channel, a]));
  const changes: string[] = [];
  for (const r of rows) {
    const was = old.get(r.channel as never);
    const label = channelLabel(String(r.channel));
    if (!was) changes.push(`${label}: added ${r.account_number}${r.active ? "" : " (off)"}`);
    else {
      const parts: string[] = [];
      if (was.accountNumber !== r.account_number) parts.push(`number ${was.accountNumber} → ${r.account_number}`);
      if (was.accountName !== r.account_name) parts.push("name changed");
      if ((was.instructions ?? null) !== r.instructions) parts.push("instructions changed");
      if (was.active !== r.active) parts.push(r.active ? "switched on" : "switched off");
      if (parts.length) changes.push(`${label}: ${parts.join(", ")}`);
    }
  }
  for (const c of cleared) if (old.has(c as never)) changes.push(`${channelLabel(c)}: removed`);

  if (changes.length) {
    const summary = changes.join("; ");
    await audit(session.user_id, "admin", "updated_payment_accounts", summary.slice(0, 1000));
    await notifyAdmins({
      type: "system",
      title: "The Workshop's payment accounts were changed",
      body: `${session.name}: ${summary}`.slice(0, 500),
      link: "/admin/payments#accounts",
    });
  }
  revalidatePath("/admin/payments");
  revalidatePath("/buyer/checkout");
  return { ok: true };
}

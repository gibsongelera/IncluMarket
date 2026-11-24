import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DataUnavailableError, getDisplayNames } from "@/lib/data";
import { isMissingObject } from "@/lib/db-errors";
import { getSettingInts } from "@/lib/settings";
import { OTC_HOLD_HOURS } from "@/lib/pricing/constants";
import { COUNTER_CHANNELS, channelLabel, payBy, type CounterChannel } from "@/lib/counter-channels";

/**
 * Paying the Workshop over the counter (migration 0028): the Workshop's
 * accounts, a buyer's checkout waiting to be paid, and the admins' queue of
 * payments to check. Shaped DTOs only. Every reader returns null before 0028,
 * so a page can say which migration it needs; the callers check who is
 * looking (the buyer who owns the checkout, or an admin).
 */

type Db = ReturnType<typeof createAdminClient>;

function fail(what: string, error: { message: string }): never {
  console.error(`[counter-payments] ${what}: ${error.message}`);
  throw new DataUnavailableError(what);
}

export interface CounterAccount {
  channel: CounterChannel;
  label: string;
  accountName: string;
  accountNumber: string;
  instructions: string | null;
  active: boolean;
  updatedAt: string | null;
}

type AccountRow = {
  channel: CounterChannel;
  account_name: string;
  account_number: string;
  instructions: string | null;
  active: boolean;
  updated_at: string | null;
};

const CHANNEL_ORDER = COUNTER_CHANNELS.map((c) => c.id);

/** The Workshop's accounts, GCash first; null before migration 0028. */
export async function getCounterAccounts(opts: { activeOnly?: boolean } = {}, db: Db = createAdminClient()): Promise<CounterAccount[] | null> {
  let q = db.from("im_payment_accounts").select("channel, account_name, account_number, instructions, active, updated_at");
  if (opts.activeOnly) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) {
    if (isMissingObject(error)) return null;
    fail("payment accounts", error);
  }
  return ((data ?? []) as AccountRow[])
    .map((r) => ({
      channel: r.channel,
      label: channelLabel(r.channel),
      accountName: r.account_name,
      accountNumber: r.account_number,
      instructions: r.instructions,
      active: r.active,
      updatedAt: r.updated_at,
    }))
    .sort((a, b) => CHANNEL_ORDER.indexOf(a.channel) - CHANNEL_ORDER.indexOf(b.channel));
}

/** How long an unpaid counter order keeps its items (Admin → Settings). */
export async function getCounterHoldHours(): Promise<number> {
  return (await getSettingInts({ otc_hold_hours: OTC_HOLD_HOURS })).otc_hold_hours;
}

/**
 * What checkout offers: the channels with an active account and the hold.
 * Null when paying the Workshop is not possible (before 0028, no active
 * account, or the accounts could not be read): checkout simply leaves it off.
 */
export async function getCounterOffer(): Promise<{ channels: string[]; holdHours: number } | null> {
  try {
    const [accounts, holdHours] = await Promise.all([getCounterAccounts({ activeOnly: true }), getCounterHoldHours()]);
    if (!accounts?.length) return null;
    return { channels: accounts.map((a) => a.label), holdHours };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// One checkout, for the buyer who placed it
// ---------------------------------------------------------------------------

export type ProofStatus = "submitted" | "approved" | "rejected";

export interface ProofSummary {
  id: number;
  channel: CounterChannel;
  channelLabel: string;
  reference: string;
  amount: number;
  hasReceipt: boolean;
  status: ProofStatus;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

type ProofDbRow = {
  id: number;
  checkout_id: number;
  buyer_id: number;
  channel: CounterChannel;
  reference: string;
  amount: number | string;
  receipt_path: string | null;
  status: ProofStatus;
  review_note: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  created_at: string;
};

const PROOF_COLUMNS = "id, checkout_id, buyer_id, channel, reference, amount, receipt_path, status, review_note, reviewed_by, reviewed_at, created_at";

function summary(r: ProofDbRow): ProofSummary {
  return {
    id: r.id,
    channel: r.channel,
    channelLabel: channelLabel(r.channel),
    reference: r.reference,
    amount: Number(r.amount),
    hasReceipt: Boolean(r.receipt_path),
    status: r.status,
    reviewNote: r.review_note,
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
  };
}

export interface CounterCheckout {
  id: number;
  placedAt: string;
  grandTotal: number;
  /** The checkout's payment: pending, paid or failed. */
  paymentStatus: string;
  orders: { id: number; sellerName: string; orderStatus: string; paymentStatus: string; total: number }[];
  /** Every order was cancelled (by the buyer, or because no payment arrived in time). */
  cancelled: boolean;
  proofs: ProofSummary[];
  holdHours: number;
  payBy: string;
}

/**
 * A counter-payment checkout of this buyer, with its orders and what they
 * have sent. Null when it is not theirs, not a counter payment, or 0028 is
 * not applied (the page then 404s: there is nothing to pay there).
 */
export async function getCounterCheckout(checkoutId: number, buyerId: number): Promise<CounterCheckout | null> {
  if (!Number.isInteger(checkoutId) || checkoutId <= 0) return null;
  const db = createAdminClient();
  const { data: ck, error } = await db
    .from("im_checkouts")
    .select("id, buyer_id, payment_provider, payment_status, grand_total, created_at")
    .eq("id", checkoutId)
    .eq("buyer_id", buyerId)
    .maybeSingle();
  if (error) {
    if (isMissingObject(error)) return null;
    fail("checkout", error);
  }
  if (!ck || ck.payment_provider !== "otc") return null;

  const [{ data: orders, error: oErr }, { data: proofs, error: pErr }, holdHours] = await Promise.all([
    db.from("im_orders").select("id, seller_id, order_status, payment_status, total_amount").eq("checkout_id", ck.id).order("id"),
    db.from("im_payment_proofs").select(PROOF_COLUMNS).eq("checkout_id", ck.id).order("created_at", { ascending: false }).limit(20),
    getCounterHoldHours(),
  ]);
  if (oErr) fail("checkout orders", oErr);
  if (pErr) {
    if (isMissingObject(pErr)) return null;
    fail("payment proofs", pErr);
  }
  const names = await getDisplayNames((orders ?? []).map((o) => Number(o.seller_id)));
  const list = (orders ?? []).map((o) => ({
    id: Number(o.id),
    sellerName: names[Number(o.seller_id)] || "PWD Seller",
    orderStatus: String(o.order_status),
    paymentStatus: String(o.payment_status),
    total: Number(o.total_amount),
  }));
  return {
    id: Number(ck.id),
    placedAt: String(ck.created_at),
    grandTotal: Number(ck.grand_total),
    paymentStatus: String(ck.payment_status),
    orders: list,
    cancelled: list.length > 0 && list.every((o) => o.orderStatus === "cancelled"),
    proofs: ((proofs ?? []) as ProofDbRow[]).map(summary),
    holdHours,
    payBy: payBy(String(ck.created_at), holdHours).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Admin → Payments: what buyers sent
// ---------------------------------------------------------------------------

export interface ProofRow extends ProofSummary {
  checkoutId: number;
  buyerName: string;
  /** What the checkout costs; the amount sent should match it. */
  due: number;
  orderIds: number[];
  /** Orders of the checkout already cancelled: confirming flags them for a refund. */
  cancelledOrders: number;
  reviewedBy: string | null;
}

export interface ProofQueue {
  toCheck: ProofRow[];
  reviewed: ProofRow[];
}

export const QUEUE_LIMIT = 100;

/** Waiting proofs, oldest first, and the latest decisions. Null before 0028. */
export async function getProofQueue(): Promise<ProofQueue | null> {
  const db = createAdminClient();
  const [open, done] = await Promise.all([
    db.from("im_payment_proofs").select(PROOF_COLUMNS).eq("status", "submitted").order("created_at").limit(QUEUE_LIMIT),
    db
      .from("im_payment_proofs")
      .select(PROOF_COLUMNS)
      .neq("status", "submitted")
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .limit(20),
  ]);
  for (const r of [open, done]) {
    if (r.error) {
      if (isMissingObject(r.error)) return null;
      fail("payment proofs", r.error);
    }
  }
  const rows = [...((open.data ?? []) as ProofDbRow[]), ...((done.data ?? []) as ProofDbRow[])];
  if (!rows.length) return { toCheck: [], reviewed: [] };

  const checkoutIds = [...new Set(rows.map((r) => r.checkout_id))];
  const [{ data: checkouts, error: cErr }, { data: orders, error: oErr }] = await Promise.all([
    db.from("im_checkouts").select("id, grand_total").in("id", checkoutIds),
    db.from("im_orders").select("id, checkout_id, order_status").in("checkout_id", checkoutIds).order("id"),
  ]);
  if (cErr) fail("proof checkouts", cErr);
  if (oErr) fail("proof orders", oErr);
  const names = await getDisplayNames(rows.flatMap((r) => [r.buyer_id, r.reviewed_by ?? 0]));
  const due = new Map((checkouts ?? []).map((c) => [Number(c.id), Number(c.grand_total)]));
  const byCheckout = new Map<number, { id: number; status: string }[]>();
  for (const o of orders ?? []) {
    const k = Number(o.checkout_id);
    byCheckout.set(k, [...(byCheckout.get(k) ?? []), { id: Number(o.id), status: String(o.order_status) }]);
  }

  const shape = (r: ProofDbRow): ProofRow => {
    const os = byCheckout.get(r.checkout_id) ?? [];
    return {
      ...summary(r),
      checkoutId: r.checkout_id,
      buyerName: names[r.buyer_id] || `Buyer #${r.buyer_id}`,
      due: due.get(r.checkout_id) ?? 0,
      orderIds: os.map((o) => o.id),
      cancelledOrders: os.filter((o) => o.status === "cancelled").length,
      reviewedBy: r.reviewed_by != null ? names[r.reviewed_by] || `Admin #${r.reviewed_by}` : null,
    };
  };
  return {
    toCheck: ((open.data ?? []) as ProofDbRow[]).map(shape),
    reviewed: ((done.data ?? []) as ProofDbRow[]).map(shape),
  };
}

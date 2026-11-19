import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DataUnavailableError, getDisplayNames } from "@/lib/data";
import { isMissingObject } from "@/lib/db-errors";
import { getSettingInts } from "@/lib/settings";

/**
 * Seller earnings and payouts (C-35, migration 0020). Who holds the money
 * decides what can be paid out: cash on delivery is collected by the seller
 * and never paid out; online payments become available once the order is
 * delivered and the return window has passed.
 */

export interface Balance {
  available: number;
  pending: number;
  collected: number;
  reserved: number;
  paidOut: number;
}

export type Availability = "available" | "pending" | "collected" | "not_earned";

export interface EarningLite {
  orderId: number;
  createdAt: string;
  deliveredAt: string | null;
  net: number;
  availability: Availability;
  online: boolean;
}

export type PayoutStatus = "requested" | "approved" | "paid" | "rejected";

export interface PayoutLite {
  id: number;
  sellerId: number;
  sellerName?: string;
  amount: number;
  method: string;
  /** Last four characters only, for the seller's own list. */
  accountMasked: string;
  /** The full account, for the admin who sends the money. */
  account?: string;
  status: PayoutStatus;
  note: string | null;
  reference: string | null;
  createdAt: string;
  decidedAt: string | null;
  paidAt: string | null;
}

export interface SellerFinance {
  available: boolean;
  balance: Balance;
  earnings: EarningLite[];
  payouts: PayoutLite[];
  minPayout: number;
  feePercent: number;
}

const mask = (s: string) => `••••${String(s ?? "").slice(-4)}`;

type PayoutRow = {
  id: number;
  seller_id: number;
  amount: number | string;
  method: string;
  account_number: string;
  status: PayoutStatus;
  note: string | null;
  reference?: string | null;
  created_at: string;
  decided_at?: string | null;
  paid_at?: string | null;
};

function payout(r: PayoutRow, withAccount: boolean): PayoutLite {
  return {
    id: r.id,
    sellerId: r.seller_id,
    amount: Number(r.amount),
    method: r.method,
    accountMasked: mask(r.account_number),
    account: withAccount ? r.account_number : undefined,
    status: r.status,
    note: r.note,
    reference: r.reference ?? null,
    createdAt: r.created_at,
    decidedAt: r.decided_at ?? null,
    paidAt: r.paid_at ?? null,
  };
}

export async function getSellerFinance(sellerId: number): Promise<SellerFinance> {
  const db = createAdminClient();
  const settings = await getSettingInts({ payout_min_amount: 100, platform_fee_percent: 0 });
  const empty: SellerFinance = {
    available: false,
    balance: { available: 0, pending: 0, collected: 0, reserved: 0, paidOut: 0 },
    earnings: [],
    payouts: [],
    minPayout: settings.payout_min_amount,
    feePercent: settings.platform_fee_percent,
  };

  const bal = await db.rpc("im_seller_balance", { p_seller: sellerId });
  if (bal.error) {
    if (isMissingObject(bal.error)) return empty;
    throw new DataUnavailableError("your balance");
  }
  const b = ((bal.data ?? [])[0] ?? {}) as Record<string, number | string>;
  const since = new Date(Date.now() - 180 * 86_400_000).toISOString();
  const [earn, pays] = await Promise.all([
    db
      .from("im_seller_earnings")
      .select("order_id, created_at, delivered_at, net, availability, payment_provider")
      .eq("seller_id", sellerId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    db.from("im_payouts").select("*").eq("seller_id", sellerId).order("created_at", { ascending: false }).limit(50),
  ]);
  if (earn.error || pays.error) throw new DataUnavailableError("your earnings");

  return {
    ...empty,
    available: true,
    balance: {
      available: Number(b.available ?? 0),
      pending: Number(b.pending ?? 0),
      collected: Number(b.collected ?? 0),
      reserved: Number(b.reserved ?? 0),
      paidOut: Number(b.paid_out ?? 0),
    },
    earnings: ((earn.data ?? []) as {
      order_id: number; created_at: string; delivered_at: string | null; net: number | string; availability: Availability; payment_provider: string | null;
    }[]).map((e) => ({
      orderId: e.order_id,
      createdAt: e.created_at,
      deliveredAt: e.delivered_at,
      net: Number(e.net),
      availability: e.availability,
      online: e.payment_provider === "paymongo",
    })),
    payouts: ((pays.data ?? []) as PayoutRow[]).map((p) => payout(p, false)),
  };
}

/** Admin → Payouts. Null before migration 0020. */
export async function getAdminPayouts(status: PayoutStatus | "all"): Promise<PayoutLite[] | null> {
  const db = createAdminClient();
  let q = db.from("im_payouts").select("*").order("created_at", { ascending: status === "requested" }).limit(200);
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return null;
  const rows = (data ?? []) as PayoutRow[];
  const names = await getDisplayNames(rows.map((r) => r.seller_id));
  return rows.map((r) => ({ ...payout(r, true), sellerName: names[r.seller_id] ?? `Seller #${r.seller_id}` }));
}

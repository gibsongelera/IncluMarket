import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isPayMongoConfigured,
  isPayMongoWebhookConfigured,
  PAYMENT_METHOD_TYPES,
  payMongoKeyMode,
  payMongoMode,
} from "@/lib/payments/paymongo";

/**
 * Admin → Payments, read-only (D-03). What checkout actually offers comes
 * from the environment — a PayMongo secret key turns online payment on — so
 * the page reports that, plus a week of online-payment outcomes. The old
 * Stripe/PayPal/GCash toggles changed a table nothing read.
 */

const METHOD_TEXT: Record<string, string> = {
  gcash: "GCash",
  paymaya: "Maya",
  grab_pay: "GrabPay",
  card: "Credit or debit card",
};

export interface PaymentStatus {
  online: {
    configured: boolean;
    mode: "test" | "live";
    /** PAYMONGO_ENV and the key's prefix disagree: webhooks will be refused. */
    modeMismatch: boolean;
    webhook: boolean;
    methods: string[];
  };
  week: { paid: number; pending: number; failed: number; refunded: number } | null;
  lastPaidAt: string | null;
}

export async function getPaymentStatus(): Promise<PaymentStatus> {
  const db = createAdminClient();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [recent, last] = await Promise.all([
    db.from("im_orders").select("payment_status").eq("payment_provider", "paymongo").gte("created_at", weekAgo),
    db
      .from("im_orders")
      .select("created_at")
      .eq("payment_provider", "paymongo")
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  let week: PaymentStatus["week"] = null;
  if (!recent.error) {
    week = { paid: 0, pending: 0, failed: 0, refunded: 0 };
    for (const o of (recent.data ?? []) as { payment_status: string }[]) {
      if (o.payment_status === "paid") week.paid++;
      else if (o.payment_status === "pending" || o.payment_status === "unpaid") week.pending++;
      else if (o.payment_status === "failed") week.failed++;
      else if (o.payment_status === "refunded") week.refunded++;
    }
  }
  return {
    online: {
      configured: isPayMongoConfigured(),
      mode: payMongoMode(),
      modeMismatch: payMongoKeyMode() !== null && payMongoKeyMode() !== payMongoMode(),
      webhook: isPayMongoWebhookConfigured(),
      methods: PAYMENT_METHOD_TYPES.map((m) => METHOD_TEXT[m] ?? m),
    },
    week,
    lastPaidAt: ((last.data ?? []) as { created_at: string }[])[0]?.created_at ?? null,
  };
}

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notify";
import { queueEmail } from "@/lib/email/send";

/**
 * Apply a payment outcome to an order.
 *
 * Shared by the PayMongo webhook and the development "simulate payment"
 * action, deliberately: the simulated path must exercise the same code that
 * runs in production, or it proves nothing.
 *
 * Idempotency is the whole design here. Payment providers guarantee
 * at-least-once delivery, so this WILL be called twice with the same event.
 * The gate is the unique index on im_transactions.external_event_id (migration
 * 0010): we insert first, and a conflict means "already handled, stop". That
 * makes the check-and-act a single atomic statement rather than a read
 * followed by a decision, which would race with a concurrent redelivery.
 */

export type PaymentOutcome = "paid" | "failed";

export interface ApplyPaymentArgs {
  orderId: number;
  outcome: PaymentOutcome;
  /** Provider-side payment/session id, stored on the order. */
  reference: string;
  /** Provider event id — the idempotency key. */
  eventId: string;
  providerId?: string;
}

export type ApplyPaymentResult =
  | { ok: true; status: "applied" | "duplicate" | "already_final" }
  | { ok: false; error: string };

export async function applyPaymentResult(
  args: ApplyPaymentArgs
): Promise<ApplyPaymentResult> {
  const db = createAdminClient();
  const providerId = args.providerId ?? "paymongo";

  const { data: order } = await db
    .from("im_orders")
    .select("id, buyer_id, total_amount, payment_status")
    .eq("id", args.orderId)
    .maybeSingle();

  if (!order) return { ok: false, error: `Order ${args.orderId} not found.` };

  // Idempotency gate. Insert before mutating anything: if this event has been
  // seen, the unique index rejects it and we stop here.
  const { error: txErr } = await db.from("im_transactions").insert({
    order_id: order.id,
    buyer_id: order.buyer_id,
    provider_id: providerId,
    amount: order.total_amount,
    currency: "PHP",
    status: args.outcome,
    external_ref: args.reference,
    external_event_id: args.eventId,
  });

  if (txErr) {
    // 23505 = unique_violation, i.e. this exact event was already processed.
    if ((txErr as { code?: string }).code === "23505") {
      return { ok: true, status: "duplicate" };
    }
    return { ok: false, error: txErr.message };
  }

  // Second guard: never move an already-paid order backwards. The `neq` makes
  // the transition conditional in SQL rather than in application logic.
  const { data: updated } = await db
    .from("im_orders")
    .update({
      payment_status: args.outcome,
      payment_provider: providerId,
      payment_reference: args.reference,
    })
    .eq("id", order.id)
    .neq("payment_status", "paid")
    .select("id")
    .maybeSingle();

  if (!updated) return { ok: true, status: "already_final" };

  if (args.outcome === "paid") {
    await db.from("im_order_status_history").insert({
      order_id: order.id,
      status: "processing",
      created_by: order.buyer_id,
    });
    await db.from("im_orders").update({ order_status: "processing" }).eq("id", order.id);

    // The cart is cleared on payment, not at order creation: an abandoned
    // checkout should leave the buyer's cart intact so they can retry.
    await db.from("im_cart_items").delete().eq("user_id", order.buyer_id);

    await createNotification({
      userId: order.buyer_id,
      type: "shipping_update",
      title: `Payment received for order #${order.id}`,
      body: "Your seller is preparing your order.",
      link: "/buyer/orders",
    });

    await notifyBuyerAndSellers(db, order.id, order.buyer_id, Number(order.total_amount));
  } else {
    await createNotification({
      userId: order.buyer_id,
      type: "shipping_update",
      title: `Payment failed for order #${order.id}`,
      body: "No money was taken. You can try paying again from My Orders.",
      link: "/buyer/orders",
    });
  }

  await db.from("im_activity_logs").insert({
    actor_role: "system",
    action: `payment_${args.outcome}`,
    entity_type: "order",
    entity_id: String(order.id),
    meta: { provider: providerId, reference: args.reference },
  });

  return { ok: true, status: "applied" };
}

/** Email the buyer, and email each seller with a line in the order. */
async function notifyBuyerAndSellers(
  db: ReturnType<typeof createAdminClient>,
  orderId: number,
  buyerId: number,
  total: number
): Promise<void> {
  const { data: buyer } = await db
    .from("im_profiles")
    .select("email, name")
    .eq("id", buyerId)
    .maybeSingle();

  if (buyer?.email) {
    await queueEmail(
      "order_paid",
      { email: buyer.email, name: buyer.name },
      { orderId, total }
    );
  }

  const { data: lines } = await db
    .from("im_order_items")
    .select("product_id")
    .eq("order_id", orderId);

  const productIds = [...new Set((lines ?? []).map((l) => l.product_id).filter(Boolean))];
  if (!productIds.length) return;

  const { data: products } = await db
    .from("im_products")
    .select("id, seller_id")
    .in("id", productIds as number[]);

  const countBySeller = new Map<number, number>();
  for (const p of products ?? []) {
    countBySeller.set(p.seller_id, (countBySeller.get(p.seller_id) ?? 0) + 1);
  }
  if (!countBySeller.size) return;

  const { data: sellers } = await db
    .from("im_profiles")
    .select("id, email, name")
    .in("id", [...countBySeller.keys()]);

  for (const seller of sellers ?? []) {
    if (!seller.email) continue;
    await queueEmail(
      "seller_new_order",
      { email: seller.email, name: seller.name },
      { orderId, itemCount: countBySeller.get(seller.id) ?? 0 }
    );
  }
}

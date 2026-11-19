import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification, emailIfWanted, notifyAdmins } from "@/lib/notify";
import { queueEmail } from "@/lib/email/send";
import { failPendingPayment, reserveOrderStock } from "./stock";
import { transitionOrder } from "@/lib/orders/transition";

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
  /** Skip the per-order buyer email (a checkout sends one for all its orders). */
  quiet?: boolean;
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

  const logActivity = (action: string) =>
    db.from("im_activity_logs").insert({
      actor_role: "system",
      action,
      entity_type: "order",
      entity_id: String(order.id),
      meta: { provider: providerId, reference: args.reference },
    });

  // ---- failed --------------------------------------------------------------
  // Only a PENDING payment can fail, and failing releases the stock it held.
  // failPendingPayment's conditional update makes the release happen once even
  // when the buyer's cancel and PayMongo's payment.failed both arrive (B-06).
  if (args.outcome === "failed") {
    const released = await failPendingPayment(
      db,
      order.id,
      "Payment failed at PayMongo. Items released back to stock."
    );
    if (!released) return { ok: true, status: "already_final" };
    await createNotification({
      userId: order.buyer_id,
      type: "order_status",
      title: `Payment failed for order #${order.id}`,
      body: "No money was taken. You can pay again from My Orders while the items are still in stock.",
      link: "/buyer/orders",
    });
    await logActivity("payment_failed");
    return { ok: true, status: "applied" };
  }

  // ---- paid ----------------------------------------------------------------
  const paidPatch = {
    payment_status: "paid",
    payment_provider: providerId,
    payment_reference: args.reference,
  };

  // Normal case: the order was waiting for this payment and still holds stock.
  // Conditional in SQL, so an already-paid order is never touched twice.
  const { data: onTime } = await db
    .from("im_orders")
    .update(paidPatch)
    .eq("id", order.id)
    .eq("payment_status", "pending")
    .select("id")
    .maybeSingle();

  let lateNote: string | null = null;
  if (!onTime) {
    // Late payment: the hold had already been released (cancelled, failed or
    // timed out) and money arrived anyway. Take the stock again if it is still
    // there; if not, the order is paid but cannot be fulfilled — flag it for a
    // refund instead of silently overselling.
    const { data: late } = await db
      .from("im_orders")
      .update(paidPatch)
      .eq("id", order.id)
      .eq("payment_status", "failed")
      .select("id")
      .maybeSingle();
    if (!late) return { ok: true, status: "already_final" };

    const again = await reserveOrderStock(db, order.id);
    if (!again.ok) {
      await db.from("im_order_status_history").insert({
        order_id: order.id,
        status: "pending",
        note: `Paid after the hold was released, but ${again.title} has sold out. Needs a refund.`,
      });
      await logActivity("payment_late_unfulfillable");
      await notifyAdmins({
        type: "system",
        title: `Refund needed: order #${order.id}`,
        body: `Payment arrived after the stock hold expired and ${again.title} is sold out.`,
        link: "/admin/payments",
      });
      await createNotification({
        userId: order.buyer_id,
        type: "order_status",
        title: `We received your payment for order #${order.id}`,
        body: `${again.title} sold out before the payment arrived. Our team will contact you about a refund.`,
        link: "/buyer/orders",
      });
      return { ok: true, status: "applied" };
    }
    lateNote = "Payment arrived after the hold was released; items were reserved again.";
  }

  // Paid: the order moves to processing through the state machine (0014),
  // which also writes the history row.
  await transitionOrder(db, {
    orderId: order.id,
    to: "processing",
    actorId: null,
    actorRole: "system",
    note: lateNote ?? "Payment received.",
  });

  // The cart is cleared on payment, not at order creation: an abandoned
  // checkout leaves it intact so the buyer can retry. Only the lines that were
  // actually ordered are removed — the buyer may have added more since.
  await clearOrderedCartLines(db, order.id, order.buyer_id);

  await createNotification({
    userId: order.buyer_id,
    type: "shipping_update",
    title: `Payment received for order #${order.id}`,
    body: "Your seller is preparing your order.",
    link: "/buyer/orders",
  });

  await notifyBuyerAndSellers(db, order.id, order.buyer_id, Number(order.total_amount), Boolean(args.quiet));
  await logActivity("payment_paid");

  return { ok: true, status: "applied" };
}

async function clearOrderedCartLines(
  db: ReturnType<typeof createAdminClient>,
  orderId: number,
  buyerId: number
): Promise<void> {
  const { data: items } = await db
    .from("im_order_items")
    .select("product_id, variant_id")
    .eq("order_id", orderId);
  for (const it of items ?? []) {
    if (it.product_id == null) continue;
    let q = db.from("im_cart_items").delete().eq("user_id", buyerId).eq("product_id", it.product_id);
    q = it.variant_id == null ? q.is("variant_id", null) : q.eq("variant_id", it.variant_id);
    await q;
  }
}

/** Email the buyer, and email each seller with a line in the order. */
async function notifyBuyerAndSellers(
  db: ReturnType<typeof createAdminClient>,
  orderId: number,
  buyerId: number,
  total: number,
  skipBuyer = false
): Promise<void> {
  const { data: buyer } = await db
    .from("im_profiles")
    .select("email, name")
    .eq("id", buyerId)
    .maybeSingle();

  if (buyer?.email && !skipBuyer) {
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
    await emailIfWanted(
      seller.id,
      "new_order",
      "seller_new_order",
      { email: seller.email, name: seller.name },
      { orderId, itemCount: countBySeller.get(seller.id) ?? 0 }
    );
  }
}

/**
 * Apply a payment outcome to every order in a checkout (migration 0015).
 *
 * One PayMongo session pays for several sellers' orders. Each order is
 * settled through applyPaymentResult() with its own idempotency key
 * (`<event>:<order>`), so a redelivered event is still a no-op per order, and
 * the buyer gets one email for the whole payment rather than one per seller.
 */
export async function applyCheckoutPayment(args: {
  checkoutId: number;
  outcome: PaymentOutcome;
  reference: string;
  eventId: string;
  providerId?: string;
}): Promise<ApplyPaymentResult> {
  const db = createAdminClient();
  const { data: checkout } = await db
    .from("im_checkouts")
    .select("id, buyer_id, grand_total")
    .eq("id", args.checkoutId)
    .maybeSingle();
  if (!checkout) return { ok: false, error: `Checkout ${args.checkoutId} not found.` };

  const { data: orders } = await db
    .from("im_orders")
    .select("id, order_status")
    .eq("checkout_id", checkout.id)
    .order("id");
  if (!orders?.length) return { ok: false, error: `Checkout ${args.checkoutId} has no orders.` };

  let applied = false;
  for (const o of orders) {
    // Money arriving for an order that was cancelled meanwhile is never
    // turned into a sale: it is recorded and flagged for a refund.
    if (args.outcome === "paid" && o.order_status === "cancelled") {
      await db.from("im_orders").update({ refund_due: true, payment_status: "paid" }).eq("id", o.id);
      await notifyAdmins({
        type: "system",
        title: `Refund needed: order #${o.id}`,
        body: "A payment arrived for an order that had already been cancelled.",
        link: "/admin/payments",
      });
      applied = true;
      continue;
    }
    const r = await applyPaymentResult({
      orderId: o.id,
      outcome: args.outcome,
      reference: args.reference,
      eventId: `${args.eventId}:${o.id}`,
      providerId: args.providerId,
      quiet: true,
    });
    if (!r.ok) return r;
    if (r.status === "applied") applied = true;
  }

  await db
    .from("im_checkouts")
    .update({ payment_status: args.outcome, payment_reference: args.reference })
    .eq("id", checkout.id)
    .neq("payment_status", "paid");

  if (applied && args.outcome === "paid") {
    const { data: buyer } = await db.from("im_profiles").select("email, name").eq("id", checkout.buyer_id).maybeSingle();
    if (buyer?.email) {
      await queueEmail(
        "order_paid",
        { email: buyer.email, name: buyer.name },
        { orderId: orders.map((o) => o.id).join(", #"), total: Number(checkout.grand_total) }
      );
    }
  }
  return { ok: true, status: applied ? "applied" : "already_final" };
}

"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { createNotification } from "@/lib/notify";
import { boundedText } from "@/lib/validation/data-url";
import { transitionOrder } from "@/lib/orders/transition";
import { orderSellerIds } from "@/lib/orders/sellers";
import { isPrepaid, type OrderState } from "@/lib/orders/state";

export interface OrderActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Buyer-side order actions: cancel before shipping, confirm receipt, request a
 * return. None of these existed — a buyer's only recourse was a support ticket
 * (B-10). The state machine in the database decides what is allowed; every
 * export here first checks that the order belongs to the caller.
 */
async function buyerMove(
  orderId: number,
  to: OrderState,
  reason: string | null,
  notify: { title: (id: number) => string; body: string }
): Promise<OrderActionResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer") return { ok: false, error: "Please sign in again." };
  const id = Number(orderId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "We could not find that order." };

  const db = createAdminClient();
  const { data: order } = await db
    .from("im_orders")
    .select("id")
    .eq("id", id)
    .eq("buyer_id", session.user_id)
    .maybeSingle();
  if (!order) return { ok: false, error: "We could not find that order." };

  const result = await transitionOrder(db, {
    orderId: id,
    to,
    actorId: session.user_id,
    actorRole: "buyer",
    note: reason,
    meta: { reason },
  });
  if (!result.ok) return { ok: false, error: result.error };

  await db.from("im_audit_logs").insert({
    actor_id: session.user_id,
    actor_role: "buyer",
    action: `order_${to}`,
    target: `order:${id}`,
  });
  for (const sellerId of await orderSellerIds(db, id)) {
    await createNotification({
      userId: sellerId,
      type: "order_status",
      title: notify.title(id),
      body: reason ? `${notify.body} Reason: ${reason}` : notify.body,
      link: "/seller/orders",
    });
  }
  revalidatePath("/buyer/orders");
  revalidatePath("/seller/orders");
  return { ok: true };
}

/**
 * Unpaid orders bought together share ONE payment: a PayMongo session, or
 * one transfer to the Workshop for the checkout's total (0028). Cancelling
 * one of them alone would leave a payment that still covers it, so a
 * "To pay" cancel cancels every still-unpaid order of that checkout.
 */
async function unpaidSiblings(orderId: number, buyerId: number): Promise<number[]> {
  const db = createAdminClient();
  const { data: order, error } = await db
    .from("im_orders")
    .select("id, checkout_id, order_status, payment_provider, payment_status")
    .eq("id", orderId)
    .eq("buyer_id", buyerId)
    .maybeSingle();
  if (error || !order) return [orderId];
  const awaiting =
    order.order_status === "pending" &&
    isPrepaid(order.payment_provider) &&
    (order.payment_status === "pending" || order.payment_status === "failed");
  if (!awaiting || !order.checkout_id) return [orderId];
  const { data: siblings } = await db
    .from("im_orders")
    .select("id")
    .eq("checkout_id", order.checkout_id)
    .eq("buyer_id", buyerId)
    .eq("order_status", "pending")
    .eq("payment_provider", order.payment_provider)
    .in("payment_status", ["pending", "failed"]);
  const ids = (siblings ?? []).map((s) => s.id as number);
  return ids.length ? ids : [orderId];
}

export async function cancelOrder(orderId: number, reason: string): Promise<OrderActionResult> {
  const why = boundedText(reason, 300);
  if (!why) return { ok: false, error: "Please choose or write a reason for cancelling." };
  const session = await getSession();
  if (!session || session.role !== "buyer") return { ok: false, error: "Please sign in again." };
  const ids = await unpaidSiblings(Number(orderId), session.user_id);
  for (const id of ids) {
    const res = await buyerMove(id, "cancelled", why, {
      title: (n) => `Order #${n} was cancelled by the buyer`,
      body: "No need to prepare it. Any items held for it are back in stock.",
    });
    if (!res.ok) return res;
  }
  return { ok: true };
}

export async function confirmOrderReceived(orderId: number): Promise<OrderActionResult> {
  return buyerMove(orderId, "delivered", "Buyer confirmed the order arrived.", {
    title: (id) => `Order #${id} was received`,
    body: "The buyer confirmed the parcel arrived.",
  });
}

export async function requestReturn(orderId: number, reason: string): Promise<OrderActionResult> {
  const why = boundedText(reason, 500);
  if (!why || why.length < 5) return { ok: false, error: "Please tell the seller what is wrong (a sentence is enough)." };
  return buyerMove(orderId, "return_requested", why, {
    title: (id) => `Return requested for order #${id}`,
    body: "Please accept or decline the return from your orders page.",
  });
}

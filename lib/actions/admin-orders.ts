"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { boundedText } from "@/lib/validation/data-url";
import { transitionOrder } from "@/lib/orders/transition";
import { orderSellerIds } from "@/lib/orders/sellers";
import { createNotification } from "@/lib/notify";

/**
 * Admin → Orders (C-40): settle a return the seller and buyer disagree on,
 * cancel an order, and record that a refund was sent. Every change goes
 * through the order state machine (im_transition_order) and is audited;
 * buyer and seller are told.
 */

export interface AdminOrderResult {
  ok: boolean;
  error?: string;
}

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

async function tellBoth(orderId: number, buyerId: number, title: string, body: string) {
  const db = createAdminClient();
  await createNotification({ userId: buyerId, type: "order_status", title, body, link: `/buyer/orders/${orderId}` });
  for (const sellerId of await orderSellerIds(db, orderId)) {
    await createNotification({ userId: sellerId, type: "order_status", title, body, link: "/seller/orders" });
  }
}

/** Accept a return (→ returned) or decline it (→ delivered), with a note both sides read. */
export async function adminSettleReturn(
  orderId: number,
  decision: "returned" | "delivered",
  note: string
): Promise<AdminOrderResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  if (decision !== "returned" && decision !== "delivered") return { ok: false, error: "Choose accept or decline." };
  const why = boundedText(note ?? "", 500);
  if (!why || why.length < 5) return { ok: false, error: "Explain the decision in a sentence — both sides read it." };
  const db = createAdminClient();
  const { data: order } = await db.from("im_orders").select("id, buyer_id, order_status").eq("id", Number(orderId)).maybeSingle();
  if (!order) return { ok: false, error: "Order not found." };
  const res = await transitionOrder(db, {
    orderId: order.id,
    to: decision,
    actorId: admin.user_id,
    actorRole: "admin",
    note: `Support decision: ${why}`,
    meta: { reason: why },
  });
  if (!res.ok) return { ok: false, error: res.error };
  await db.from("im_audit_logs").insert({
    actor_id: admin.user_id,
    actor_role: "admin",
    action: decision === "returned" ? "return_accepted_by_admin" : "return_declined_by_admin",
    target: `order:${order.id} note:${why}`,
  });
  await tellBoth(
    order.id,
    order.buyer_id,
    decision === "returned" ? `Return for order #${order.id} accepted by support` : `Return for order #${order.id} declined by support`,
    why
  );
  revalidatePath("/admin/orders");
  return { ok: true };
}

/** Cancel an order on someone's behalf (support cases), with a reason. */
export async function adminCancelOrder(orderId: number, reason: string): Promise<AdminOrderResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const why = boundedText(reason ?? "", 300);
  if (!why || why.length < 5) return { ok: false, error: "Give the reason in a sentence." };
  const db = createAdminClient();
  const { data: order } = await db.from("im_orders").select("id, buyer_id").eq("id", Number(orderId)).maybeSingle();
  if (!order) return { ok: false, error: "Order not found." };
  const res = await transitionOrder(db, {
    orderId: order.id,
    to: "cancelled",
    actorId: admin.user_id,
    actorRole: "admin",
    note: `Cancelled by support: ${why}`,
    meta: { reason: why },
  });
  if (!res.ok) return { ok: false, error: res.error };
  await db.from("im_audit_logs").insert({ actor_id: admin.user_id, actor_role: "admin", action: "order_cancelled_by_admin", target: `order:${order.id} reason:${why}` });
  await tellBoth(order.id, order.buyer_id, `Order #${order.id} was cancelled by support`, why);
  revalidatePath("/admin/orders");
  return { ok: true };
}

/** Record that the money for a refund-due order was sent back to the buyer. */
export async function markRefundSent(orderId: number, reference: string): Promise<AdminOrderResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const ref = boundedText(reference ?? "", 120);
  if (!ref || ref.length < 3) return { ok: false, error: "Enter the refund reference (PayMongo or transfer number)." };
  const db = createAdminClient();
  const { data, error } = await db
    .from("im_orders")
    .update({ refund_due: false, payment_status: "refunded" })
    .eq("id", Number(orderId))
    .eq("refund_due", true)
    .select("id, buyer_id, order_status")
    .maybeSingle();
  if (error) return { ok: false, error: "Could not update the order. Please try again." };
  if (!data) return { ok: false, error: "This order has no refund due." };
  // The timeline records the refund against the current order status.
  await db
    .from("im_order_status_history")
    .insert({ order_id: data.id, status: data.order_status, note: `Refund sent. Reference: ${ref}` });
  await db.from("im_audit_logs").insert({ actor_id: admin.user_id, actor_role: "admin", action: "refund_sent", target: `order:${data.id} ref:${ref}` });
  await createNotification({
    userId: data.buyer_id,
    type: "order_status",
    title: `Refund for order #${data.id} sent`,
    body: `Reference: ${ref}. It can take a few days to reach you.`,
    link: `/buyer/orders/${data.id}`,
  });
  revalidatePath("/admin/orders");
  return { ok: true };
}

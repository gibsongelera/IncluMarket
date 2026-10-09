"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { failPendingPayment, reserveOrderStock } from "@/lib/payments/stock";
import { createCheckoutSession, isPayMongoConfigured, toCentavos } from "@/lib/payments/paymongo";
import { roundMoney, variantLabel } from "@/lib/pricing/core";

export interface BuyerPaymentResult {
  ok: boolean;
  error?: string;
  redirectUrl?: string;
}

function validId(n: unknown): number | null {
  const v = Number(n);
  return Number.isInteger(v) && v > 0 ? v : null;
}

/**
 * The buyer came back from PayMongo's cancel button.
 *
 * Releases the stock the unpaid order was holding. Safe to call more than once
 * and safe to race with the webhook: failPendingPayment only acts on a payment
 * that is still pending. Public endpoint — the order must belong to the caller.
 */
export async function abandonPayment(orderId: number): Promise<BuyerPaymentResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer") return { ok: false, error: "Please sign in again." };
  const id = validId(orderId);
  if (!id) return { ok: false, error: "We could not find that order." };

  const db = createAdminClient();
  const { data: order } = await db
    .from("im_orders")
    .select("id, payment_status, payment_provider")
    .eq("id", id)
    .eq("buyer_id", session.user_id)
    .maybeSingle();
  if (!order || order.payment_provider !== "paymongo") return { ok: false, error: "We could not find that order." };
  if (order.payment_status === "paid") return { ok: false, error: "This order is already paid." };

  const released = await failPendingPayment(db, id, "Buyer cancelled the payment. Items released back to stock.");
  if (released) {
    await db.from("im_audit_logs").insert({
      actor_id: session.user_id,
      actor_role: "buyer",
      action: "payment_cancelled",
      target: `order:${id}`,
    });
  }
  revalidatePath("/buyer/orders");
  return { ok: true };
}

/**
 * "Pay now" on an unpaid online order.
 *
 * The notification for a failed payment used to promise "you can try paying
 * again from My Orders" with no button to do it. A pending order reuses the
 * stock it still holds; a failed or timed-out one must take the stock again
 * first, and says so plainly if an item has sold out in the meantime. The
 * amounts come from the stored order lines, never from the browser.
 */
export async function retryPayment(orderId: number): Promise<BuyerPaymentResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer") return { ok: false, error: "Please sign in again." };
  const id = validId(orderId);
  if (!id) return { ok: false, error: "We could not find that order." };
  if (!isPayMongoConfigured()) {
    return { ok: false, error: "Online payment is not available right now." };
  }

  const db = createAdminClient();
  const { data: order } = await db
    .from("im_orders")
    .select("id, order_status, payment_status, payment_provider, total_amount, shipping_name, shipping_phone")
    .eq("id", id)
    .eq("buyer_id", session.user_id)
    .maybeSingle();
  if (!order || order.payment_provider !== "paymongo") return { ok: false, error: "We could not find that order." };
  if (order.payment_status === "paid") return { ok: false, error: "This order is already paid." };
  if (order.order_status !== "pending") return { ok: false, error: "This order can no longer be paid." };

  if (order.payment_status === "failed") {
    const again = await reserveOrderStock(db, id);
    if (!again.ok) {
      return {
        ok: false,
        error: `${again.title} sold out in the meantime, so this order can't be paid. Please order again from your cart.`,
      };
    }
    const { data: reopened } = await db
      .from("im_orders")
      .update({ payment_status: "pending" })
      .eq("id", id)
      .eq("payment_status", "failed")
      .select("id")
      .maybeSingle();
    if (!reopened) return { ok: false, error: "This order changed while you were paying. Please refresh." };
  }

  // Rebuild the PayMongo lines from what was ordered.
  const { data: items } = await db
    .from("im_order_items")
    .select("product_id, variant_id, quantity, unit_price")
    .eq("order_id", id);
  const productIds = [...new Set((items ?? []).map((i) => i.product_id).filter(Boolean))] as number[];
  const variantIds = [...new Set((items ?? []).map((i) => i.variant_id).filter(Boolean))] as number[];
  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length
      ? db.from("im_products").select("id, title").in("id", productIds)
      : Promise.resolve({ data: [] as { id: number; title: string }[] }),
    variantIds.length
      ? db.from("im_product_variants").select("id, color_name, size").in("id", variantIds)
      : Promise.resolve({ data: [] as { id: number; color_name: string; size: string | null }[] }),
  ]);
  const title = new Map((products ?? []).map((p) => [p.id, p.title as string]));
  const label = new Map((variants ?? []).map((v) => [v.id, variantLabel(v.color_name, v.size)]));

  const lines = (items ?? []).map((i) => {
    const name = title.get(i.product_id as number) ?? "Item";
    const v = i.variant_id != null ? label.get(i.variant_id) : undefined;
    return {
      name: v && v !== "Standard" ? `${name} — ${v}` : name,
      amountCentavos: toCentavos(Number(i.unit_price)),
      quantity: Number(i.quantity),
    };
  });
  const itemsTotal = roundMoney((items ?? []).reduce((n, i) => n + Number(i.unit_price) * Number(i.quantity), 0));
  const shipping = Math.max(0, roundMoney(Number(order.total_amount) - itemsTotal));

  const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const checkout = await createCheckoutSession({
    orderId: id,
    lines,
    shippingCentavos: toCentavos(shipping),
    billing: {
      name: order.shipping_name || session.name,
      email: session.email,
      phone: order.shipping_phone || "",
    },
    successUrl: `${origin}/buyer/orders?paid=${id}`,
    cancelUrl: `${origin}/buyer/orders?cancelled=${id}`,
  });
  if (!checkout.ok) return { ok: false, error: checkout.error };

  await db.from("im_orders").update({ payment_reference: checkout.sessionId }).eq("id", id);
  // A fresh history row restarts the hold window for the expiry sweep.
  await db.from("im_order_status_history").insert({
    order_id: id,
    status: "pending",
    note: "Payment restarted by the buyer.",
    created_by: session.user_id,
  });
  await db.from("im_audit_logs").insert({
    actor_id: session.user_id,
    actor_role: "buyer",
    action: "payment_retried",
    target: `order:${id}`,
  });
  revalidatePath("/buyer/orders");
  return { ok: true, redirectUrl: checkout.checkoutUrl };
}

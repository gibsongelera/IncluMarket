"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { failPendingPayment, releaseOrderStock, reserveOrderStock } from "@/lib/payments/stock";
import { createCheckoutSession, isPayMongoConfigured, toCentavos } from "@/lib/payments/paymongo";
import { roundMoney, variantLabel } from "@/lib/pricing/core";
import { isMissingObject } from "@/lib/db-errors";

export interface BuyerPaymentResult {
  ok: boolean;
  error?: string;
  redirectUrl?: string;
}

type Db = ReturnType<typeof createAdminClient>;

interface PayOrder {
  id: number;
  order_status: string;
  payment_status: string;
  payment_provider: string | null;
  total_amount: number;
  shipping_fee?: number | null;
  shipping_name: string | null;
  shipping_phone: string | null;
  checkout_id?: number | null;
}

function validId(n: unknown): number | null {
  const v = Number(n);
  return Number.isInteger(v) && v > 0 ? v : null;
}

/**
 * The buyer's orders paid together with this one: every order in its checkout
 * (migration 0015), or just the order itself on older data. Always scoped to
 * the caller — a public endpoint must never reach someone else's order.
 */
async function ordersPaidTogether(db: Db, orderId: number, buyerId: number): Promise<PayOrder[]> {
  const cols =
    "id, order_status, payment_status, payment_provider, total_amount, shipping_fee, shipping_name, shipping_phone, checkout_id";
  const first = await db.from("im_orders").select(cols).eq("id", orderId).eq("buyer_id", buyerId).maybeSingle();
  if (first.error && isMissingObject(first.error)) {
    const legacy = await db
      .from("im_orders")
      .select("id, order_status, payment_status, payment_provider, total_amount, shipping_name, shipping_phone")
      .eq("id", orderId)
      .eq("buyer_id", buyerId)
      .maybeSingle();
    return legacy.data ? [legacy.data as PayOrder] : [];
  }
  const order = first.data as PayOrder | null;
  if (!order) return [];
  if (!order.checkout_id) return [order];
  const { data } = await db
    .from("im_orders")
    .select(cols)
    .eq("checkout_id", order.checkout_id)
    .eq("buyer_id", buyerId)
    .order("id");
  return (data as PayOrder[] | null) ?? [order];
}

/**
 * The buyer came back from PayMongo's cancel button.
 *
 * Releases the stock the unpaid orders were holding. Safe to call more than
 * once and safe to race with the webhook: failPendingPayment only acts on a
 * payment that is still pending.
 */
export async function abandonPayment(orderId: number): Promise<BuyerPaymentResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer") return { ok: false, error: "Please sign in again." };
  const id = validId(orderId);
  if (!id) return { ok: false, error: "We could not find that order." };

  const db = createAdminClient();
  const orders = (await ordersPaidTogether(db, id, session.user_id)).filter((o) => o.payment_provider === "paymongo");
  if (!orders.length) return { ok: false, error: "We could not find that order." };
  if (orders.every((o) => o.payment_status === "paid")) return { ok: false, error: "This order is already paid." };

  let released = false;
  for (const o of orders) {
    if (await failPendingPayment(db, o.id, "Buyer cancelled the payment. Items released back to stock.")) released = true;
  }
  if (orders[0].checkout_id) {
    await db.from("im_checkouts").update({ payment_status: "failed" }).eq("id", orders[0].checkout_id).eq("payment_status", "pending");
  }
  if (released) {
    await db.from("im_audit_logs").insert({
      actor_id: session.user_id,
      actor_role: "buyer",
      action: "payment_cancelled",
      target: `order:${orders.map((o) => o.id).join(",")}`,
    });
  }
  revalidatePath("/buyer/orders");
  return { ok: true };
}

/**
 * "Pay now" on an unpaid online order — and every order paid together with it.
 *
 * Orders still pending reuse the stock they hold; failed or timed-out ones
 * take it again first, all or nothing. Amounts come from the stored order
 * lines, never from the browser.
 */
export async function retryPayment(orderId: number): Promise<BuyerPaymentResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer") return { ok: false, error: "Please sign in again." };
  const id = validId(orderId);
  if (!id) return { ok: false, error: "We could not find that order." };
  if (!isPayMongoConfigured()) return { ok: false, error: "Online payment is not available right now." };

  const db = createAdminClient();
  const all = await ordersPaidTogether(db, id, session.user_id);
  if (!all.length || all[0].payment_provider !== "paymongo") return { ok: false, error: "We could not find that order." };
  const payable = all.filter(
    (o) => o.order_status === "pending" && (o.payment_status === "pending" || o.payment_status === "failed")
  );
  if (!payable.length) {
    return {
      ok: false,
      error: all.some((o) => o.payment_status === "paid") ? "This order is already paid." : "This order can no longer be paid.",
    };
  }

  // Take stock again for the orders whose hold was released, all or nothing.
  const retaken: number[] = [];
  for (const o of payable.filter((x) => x.payment_status === "failed")) {
    const again = await reserveOrderStock(db, o.id);
    if (!again.ok) {
      for (const r of retaken) await releaseOrderStock(db, r);
      return {
        ok: false,
        error: `${again.title} sold out in the meantime, so this order can't be paid. Please order again from your cart.`,
      };
    }
    retaken.push(o.id);
  }
  for (const r of retaken) {
    await db.from("im_orders").update({ payment_status: "pending" }).eq("id", r).eq("payment_status", "failed");
  }

  // Rebuild the PayMongo lines from what was ordered.
  const ids = payable.map((o) => o.id);
  const { data: items } = await db
    .from("im_order_items")
    .select("order_id, product_id, variant_id, quantity, unit_price")
    .in("order_id", ids);
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
  const ordersTotal = roundMoney(payable.reduce((n, o) => n + Number(o.total_amount), 0));
  const shipping = Math.max(0, roundMoney(ordersTotal - itemsTotal));
  const checkoutId = payable[0].checkout_id ?? undefined;

  const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const checkout = await createCheckoutSession({
    checkoutId,
    orderId: checkoutId ? undefined : id,
    lines,
    shippingCentavos: toCentavos(shipping),
    billing: {
      name: payable[0].shipping_name || session.name,
      email: session.email,
      phone: payable[0].shipping_phone || "",
    },
    successUrl: `${origin}/buyer/orders?paid=${id}`,
    cancelUrl: `${origin}/buyer/orders?cancelled=${id}`,
  });
  if (!checkout.ok) {
    for (const r of retaken) await failPendingPayment(db, r, "The online payment could not be restarted.");
    return { ok: false, error: checkout.error };
  }

  await db.from("im_orders").update({ payment_reference: checkout.sessionId }).in("id", ids);
  if (checkoutId) {
    await db.from("im_checkouts").update({ payment_reference: checkout.sessionId, payment_status: "pending" }).eq("id", checkoutId);
  }
  // A fresh history row restarts each order's hold window for the expiry sweep.
  await db.from("im_order_status_history").insert(
    ids.map((oid) => ({ order_id: oid, status: "pending", note: "Payment restarted by the buyer.", created_by: session.user_id }))
  );
  await db.from("im_audit_logs").insert({
    actor_id: session.user_id,
    actor_role: "buyer",
    action: "payment_retried",
    target: `order:${ids.join(",")}`,
  });
  revalidatePath("/buyer/orders");
  return { ok: true, redirectUrl: checkout.checkoutUrl };
}

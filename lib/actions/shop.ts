"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { clearCartAction, getCartItems } from "@/lib/actions/cart";
import { createNotification } from "@/lib/notify";
import { queueEmail } from "@/lib/email/brevo";
import {
  createCheckoutSession,
  isPayMongoConfigured,
  toCentavos,
} from "@/lib/payments/paymongo";
import { boundedText } from "@/lib/validation/data-url";
import { SHIPPING_FEE } from "@/lib/pricing";
import type { Priority } from "@/lib/types";

const LOW_STOCK_THRESHOLD = 5;

export type PaymentMethod = "cod" | "paymongo";

export interface ActionResult {
  ok: boolean;
  error?: string;
  orderId?: number;
}

export interface PlaceOrderInput {
  shippingName: string;
  shippingAddress: string;
  shippingCity: string;
  shippingPhone: string;
  paymentMethod: PaymentMethod;
}

export interface PlaceOrderResult extends ActionResult {
  /** Present for online payment: send the browser here to pay. */
  redirectUrl?: string;
}

/** PH mobile or landline, with or without country code. */
const PHONE_RE = /^(?:\+?63|0)\d{9,10}$/;

function cleanPhone(input: string): string {
  return String(input || "").replace(/[\s()-]/g, "");
}

/**
 * Place an order.
 *
 * Previously took NO arguments: CheckoutClient collected name, address, city,
 * phone and a payment choice, validated them in the browser, and then called
 * `placeOrder()` — discarding every field. im_orders.shipping_* and
 * payment_provider were null on every order ever placed, and the admin Excel
 * export had columns for them that were permanently blank.
 *
 * Stock was also never validated. The decrement was `Math.max(0, stock - qty)`,
 * so ordering 500 of a 3-stock item succeeded silently and set stock to 0. The
 * only ceiling was a `stockCap` argument passed in from the client, which any
 * caller could omit.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer")
    return { ok: false, error: "Sign in as a buyer to place an order." };

  // ---- validate the destination -------------------------------------------
  const shippingName = boundedText(input?.shippingName, 120);
  const shippingAddress = boundedText(input?.shippingAddress, 500);
  const shippingCity = boundedText(input?.shippingCity, 80);
  const phone = cleanPhone(input?.shippingPhone);

  if (!shippingName) return { ok: false, error: "Please enter the full name of the recipient." };
  if (!shippingAddress) return { ok: false, error: "Please enter a delivery address." };
  if (!shippingCity) return { ok: false, error: "Please enter a city." };
  if (!PHONE_RE.test(phone))
    return { ok: false, error: "Please enter a valid Philippine contact number." };

  const paymentMethod: PaymentMethod = input?.paymentMethod === "paymongo" ? "paymongo" : "cod";

  if (paymentMethod === "paymongo" && !isPayMongoConfigured()) {
    return {
      ok: false,
      error: "Online payment is not available right now. Please choose cash on delivery.",
    };
  }

  const items = await getCartItems();
  if (!items.length) return { ok: false, error: "Your cart is empty." };

  const db = createAdminClient();

  // ---- validate stock BEFORE writing anything -----------------------------
  const variantLines = items.filter((it) => it.variant_id);
  const variantIds = variantLines.map((it) => it.variant_id as number);

  if (variantIds.length) {
    const { data: variants } = await db
      .from("im_product_variants")
      .select("id, product_id, stock_qty")
      .in("id", variantIds);

    const stockById = new Map((variants ?? []).map((v) => [v.id, Number(v.stock_qty)]));
    const productIds = [...new Set((variants ?? []).map((v) => v.product_id))];
    const { data: titles } = await db.from("im_products").select("id, title").in("id", productIds);
    const titleById = new Map((titles ?? []).map((t) => [t.id, t.title as string]));

    for (const line of variantLines) {
      const available = stockById.get(line.variant_id as number);
      if (available === undefined) {
        return { ok: false, error: "One of the items in your cart is no longer available." };
      }
      if (available < line.quantity) {
        const title = titleById.get(line.product_id) ?? "an item in your cart";
        return {
          ok: false,
          error:
            available === 0
              ? `${title} just sold out. Please remove it from your cart.`
              : `Only ${available} left of ${title}. Please lower the quantity.`,
        };
      }
    }
  }

  const subtotal = items.reduce(
    (n, it) => n + Number(it.unit_price || 0) * Number(it.quantity || 0),
    0
  );
  // Computed server-side. The checkout page renders the same constant, but the
  // authoritative total must never come from the client.
  const total = subtotal + SHIPPING_FEE;

  // ---- create the order ----------------------------------------------------
  const { data: order, error } = await db
    .from("im_orders")
    .insert({
      buyer_id: session.user_id,
      total_amount: total,
      order_status: "pending",
      payment_status: paymentMethod === "cod" ? "unpaid" : "pending",
      payment_provider: paymentMethod,
      shipping_name: shippingName,
      shipping_address: shippingAddress,
      shipping_city: shippingCity,
      shipping_phone: phone,
    })
    .select("*")
    .single();
  if (error || !order) return { ok: false, error: error?.message || "Could not place order." };

  await db.from("im_order_status_history").insert({
    order_id: order.id,
    status: "pending",
    created_by: session.user_id,
  });

  const { error: itemsErr } = await db.from("im_order_items").insert(
    items.map((it) => ({
      order_id: order.id,
      product_id: it.product_id,
      variant_id: it.variant_id || null,
      quantity: it.quantity,
      unit_price: it.unit_price,
    }))
  );
  if (itemsErr) return { ok: false, error: itemsErr.message };

  // ---- reserve stock atomically -------------------------------------------
  // im_decrement_variant_stock only succeeds when stock_qty >= qty, so the
  // check and the write are a single statement and cannot race another buyer.
  // PostgREST gives us no multi-statement transaction here, so a partial
  // failure is unwound with compensating restores rather than a rollback.
  const reserved: { variantId: number; qty: number }[] = [];

  for (const line of variantLines) {
    const variantId = line.variant_id as number;
    const { data: decremented } = await db.rpc("im_decrement_variant_stock", {
      p_variant_id: variantId,
      p_qty: line.quantity,
    });

    if (decremented !== true) {
      for (const r of reserved) {
        await db.rpc("im_restore_variant_stock", { p_variant_id: r.variantId, p_qty: r.qty });
      }
      await db.from("im_orders").delete().eq("id", order.id);
      return {
        ok: false,
        error: "Someone just bought the last of one of your items. Please review your cart.",
      };
    }
    reserved.push({ variantId, qty: line.quantity });
  }

  await alertLowStock(db, variantLines);
  await notifySellersOfNewOrder(db, items, order.id);

  await db.from("im_audit_logs").insert({
    actor_id: session.user_id,
    actor_role: "buyer",
    action: "placed_order",
    target: `order:${order.id}`,
  });

  // ---- settle --------------------------------------------------------------
  if (paymentMethod === "paymongo") {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const checkout = await createCheckoutSession({
      orderId: order.id,
      lines: items.map((it) => ({
        name: `Item #${it.product_id}`,
        amountCentavos: toCentavos(it.unit_price),
        quantity: it.quantity,
      })),
      shippingCentavos: toCentavos(SHIPPING_FEE),
      billing: { name: shippingName, email: session.email, phone },
      successUrl: `${origin}/buyer/orders?paid=${order.id}`,
      cancelUrl: `${origin}/buyer/checkout?cancelled=${order.id}`,
    });

    if (!checkout.ok) {
      // Give the stock back and mark the order dead — the buyer never paid.
      for (const r of reserved) {
        await db.rpc("im_restore_variant_stock", { p_variant_id: r.variantId, p_qty: r.qty });
      }
      await db.from("im_orders").update({ payment_status: "failed" }).eq("id", order.id);
      return { ok: false, error: checkout.error };
    }

    await db.from("im_orders").update({ payment_reference: checkout.sessionId }).eq("id", order.id);

    // The cart is deliberately NOT cleared here. It is cleared by the webhook
    // once payment succeeds, so abandoning the hosted checkout page leaves the
    // buyer cart intact and they can retry.
    revalidatePath("/buyer/orders");
    return { ok: true, orderId: order.id, redirectUrl: checkout.checkoutUrl };
  }

  await clearCartAction();
  await queueEmail(
    "order_confirmation",
    { email: session.email, name: session.name },
    { orderId: order.id, total, buyerName: session.name, paymentMethod: "cod" }
  );

  revalidatePath("/buyer/orders");
  revalidatePath("/buyer/cart");
  return { ok: true, orderId: order.id };
}

/** Warn each seller whose variant just dropped to or below the threshold. */
async function alertLowStock(
  db: ReturnType<typeof createAdminClient>,
  lines: { variant_id: number; product_id: number }[]
): Promise<void> {
  for (const line of lines) {
    const { data: v } = await db
      .from("im_product_variants")
      .select("stock_qty")
      .eq("id", line.variant_id)
      .maybeSingle();
    if (!v || Number(v.stock_qty) > LOW_STOCK_THRESHOLD) continue;

    const { data: p } = await db
      .from("im_products")
      .select("seller_id, title")
      .eq("id", line.product_id)
      .maybeSingle();
    if (!p) continue;

    await createNotification({
      userId: p.seller_id,
      type: "low_stock",
      title: `Low stock: ${p.title}`,
      body: `Only ${v.stock_qty} left. Restock soon to avoid selling out.`,
      link: "/seller/products",
    });
  }
}

/** One in-app notification per seller with a line in this order. */
async function notifySellersOfNewOrder(
  db: ReturnType<typeof createAdminClient>,
  items: { product_id: number }[],
  orderId: number
): Promise<void> {
  const productIds = [...new Set(items.map((it) => it.product_id).filter(Boolean))];
  if (!productIds.length) return;

  const { data: products } = await db.from("im_products").select("seller_id").in("id", productIds);

  for (const sellerId of new Set((products ?? []).map((p) => p.seller_id))) {
    await createNotification({
      userId: sellerId,
      type: "new_order",
      title: `New order #${orderId}`,
      body: "You have a new order to fulfill.",
      link: "/seller/orders",
    });
  }
}

export async function addReview(
  productId: number,
  rating: number,
  comment: string
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer")
    return { ok: false, error: "Sign in as a buyer to leave a review." };
  if (!(rating >= 1 && rating <= 5))
    return { ok: false, error: "Rating must be between 1 and 5." };

  const db = createAdminClient();
  const { error } = await db.from("im_product_reviews").upsert(
    {
      product_id: productId,
      buyer_id: session.user_id,
      rating_score: rating,
      comment_text: boundedText(comment, 2000),
      created_at: new Date().toISOString(),
    },
    { onConflict: "product_id,buyer_id" }
  );
  if (error) return { ok: false, error: error.message };
  await db.from("im_audit_logs").insert({
    actor_id: session.user_id,
    actor_role: "buyer",
    action: "reviewed_product",
    target: `product:${productId}`,
  });

  const { data: product } = await db
    .from("im_products")
    .select("seller_id, title")
    .eq("id", productId)
    .maybeSingle();
  if (product) {
    await createNotification({
      userId: product.seller_id,
      type: "new_review",
      title: `New review on ${product.title}`,
      body: `${rating}-star review received.`,
      link: "/seller/reviews",
    });
  }

  revalidatePath(`/buyer/product/${productId}`);
  return { ok: true };
}

export async function createTicket(
  subject: string,
  description: string,
  priority: Priority
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in first." };
  const cleanSubject = boundedText(subject, 200);
  const cleanDesc = boundedText(description, 5000);
  if (!cleanSubject || !cleanDesc)
    return { ok: false, error: "Subject and description are required." };

  const db = createAdminClient();
  const { data: ticket, error } = await db
    .from("im_support_tickets")
    .insert({
      user_id: session.user_id,
      subject: cleanSubject,
      description_narrative: cleanDesc,
      ticket_status: "open",
      priority_level: priority || "medium",
    })
    .select("*")
    .single();
  if (error || !ticket) return { ok: false, error: error?.message || "Could not create ticket." };

  await db.from("im_ticket_responses").insert({
    ticket_id: ticket.id,
    author_role: session.role,
    author_id: session.user_id,
    message: cleanDesc,
  });
  await db.from("im_audit_logs").insert({
    actor_id: session.user_id,
    actor_role: session.role,
    action: "created_ticket",
    target: `ticket:${ticket.id}`,
  });
  revalidatePath("/buyer/support");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { createNotification } from "@/lib/notify";
import { queueEmail } from "@/lib/email/send";
import {
  createCheckoutSession,
  isPayMongoConfigured,
  toCentavos,
} from "@/lib/payments/paymongo";
import { boundedText } from "@/lib/validation/data-url";
import { checkPublicProduct } from "@/lib/catalog";
import { priceCartForBuyer } from "@/lib/pricing/engine";
import type { PricedLine } from "@/lib/pricing/core";
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
  /** Check out only these cart lines; omitted = the whole cart. */
  cartItemIds?: number[];
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

/** What the buyer sees on PayMongo's page: the product, never "Item #12". */
function checkoutLineName(line: Pick<PricedLine, "title" | "variantLabel">): string {
  return line.variantLabel && line.variantLabel !== "Standard"
    ? `${line.title} — ${line.variantLabel}`
    : line.title;
}

/**
 * Place an order.
 *
 * Prices come from lib/pricing/engine.ts — the same pipeline the cart and
 * checkout pages render — so the flash-sale price a buyer saw is the price
 * charged (it used to be base_price, B-02) and a variant that does not belong
 * to its product can never be ordered (N-01). Nothing about price, stock or
 * the variant is taken from the browser.
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
    return {
      ok: false,
      error: "Please enter a valid Philippine contact number, for example 09171234567.",
    };

  const paymentMethod: PaymentMethod = input?.paymentMethod === "paymongo" ? "paymongo" : "cod";

  if (paymentMethod === "paymongo" && !isPayMongoConfigured()) {
    return {
      ok: false,
      error: "Online payment is not available right now. Please choose cash on delivery.",
    };
  }

  // ---- price the cart on the server ---------------------------------------
  const selected = Array.isArray(input?.cartItemIds)
    ? input.cartItemIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : null;
  let cart;
  try {
    cart = await priceCartForBuyer(session.user_id, selected);
  } catch {
    return { ok: false, error: "We could not reach the shop. Your cart is safe — please try again." };
  }
  if (!cart.lines.length) return { ok: false, error: "Your cart is empty." };
  if (!cart.purchasable) return { ok: false, error: cart.firstProblem || "Please review your cart." };

  const db = createAdminClient();
  const lines = cart.lines;
  const total = cart.grandTotal;

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
    .select("id")
    .single();
  if (error || !order) return { ok: false, error: "Could not place your order. Please try again." };

  await db.from("im_order_status_history").insert({
    order_id: order.id,
    status: "pending",
    created_by: session.user_id,
  });

  const { error: itemsErr } = await db.from("im_order_items").insert(
    lines.map((l) => ({
      order_id: order.id,
      product_id: l.productId,
      variant_id: l.variantId,
      quantity: l.quantity,
      unit_price: l.unitPrice,
    }))
  );
  if (itemsErr) {
    // An order with no lines is worse than no order: it shows up in My Orders
    // and in seller and admin reports with a total and nothing in it (B-07).
    // History rows cascade with the order.
    await db.from("im_orders").delete().eq("id", order.id);
    return { ok: false, error: "Could not place your order. Your cart is safe — please try again." };
  }

  // ---- reserve stock atomically -------------------------------------------
  // im_decrement_variant_stock only succeeds when stock_qty >= qty, so the
  // check and the write are a single statement and cannot race another buyer.
  // PostgREST gives us no multi-statement transaction here, so a partial
  // failure is unwound with compensating restores rather than a rollback.
  const reserved: { variantId: number; qty: number }[] = [];
  for (const line of lines) {
    const variantId = line.variantId as number;
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
        error: `Someone just bought the last of ${line.title}. Please review your cart.`,
      };
    }
    reserved.push({ variantId, qty: line.quantity });
  }

  const orderedLines = lines.map((l) => ({ variant_id: l.variantId as number, product_id: l.productId }));
  await alertLowStock(db, orderedLines);
  await notifySellersOfNewOrder(db, orderedLines, order.id);

  await db.from("im_audit_logs").insert({
    actor_id: session.user_id,
    actor_role: "buyer",
    action: "placed_order",
    target: `order:${order.id}`,
  });

  const cartItemIds = lines.map((l) => l.cartItemId).filter((n): n is number => n != null);

  // ---- settle --------------------------------------------------------------
  if (paymentMethod === "paymongo") {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const checkout = await createCheckoutSession({
      orderId: order.id,
      lines: lines.map((l) => ({
        name: checkoutLineName(l),
        amountCentavos: toCentavos(l.unitPrice),
        quantity: l.quantity,
        description: l.sale ? `${l.sale.percent}% flash sale price` : undefined,
      })),
      shippingCentavos: toCentavos(cart.shippingTotal),
      billing: { name: shippingName, email: session.email, phone },
      successUrl: `${origin}/buyer/orders?paid=${order.id}`,
      cancelUrl: `${origin}/buyer/checkout?cancelled=${order.id}`,
    });

    if (!checkout.ok) {
      // Give the stock back and mark the payment failed — the buyer never paid.
      for (const r of reserved) {
        await db.rpc("im_restore_variant_stock", { p_variant_id: r.variantId, p_qty: r.qty });
      }
      await db.from("im_orders").update({ payment_status: "failed" }).eq("id", order.id);
      return { ok: false, error: checkout.error };
    }

    await db.from("im_orders").update({ payment_reference: checkout.sessionId }).eq("id", order.id);

    // The cart is deliberately NOT cleared here. The webhook removes the
    // ordered lines once payment succeeds, so abandoning the hosted checkout
    // page leaves the buyer's cart intact and they can retry.
    revalidatePath("/buyer/orders");
    return { ok: true, orderId: order.id, redirectUrl: checkout.checkoutUrl };
  }

  if (cartItemIds.length) {
    await db.from("im_cart_items").delete().eq("user_id", session.user_id).in("id", cartItemIds);
  }
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
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return { ok: false, error: "Please choose from 1 to 5 stars." };

  const db = createAdminClient();
  const visible = await checkPublicProduct(db, productId);
  if (!visible.ok) return { ok: false, error: visible.error };

  // Only a buyer who received the product may review it. Anyone could review
  // anything before, which made the "verified purchase" badge meaningless
  // (B-11).
  const { data: delivered } = await db
    .from("im_orders")
    .select("id")
    .eq("buyer_id", session.user_id)
    .eq("order_status", "delivered");
  const deliveredIds = (delivered ?? []).map((o) => o.id);
  const { data: bought } = deliveredIds.length
    ? await db
        .from("im_order_items")
        .select("id")
        .in("order_id", deliveredIds)
        .eq("product_id", productId)
        .limit(1)
    : { data: [] as { id: number }[] };
  if (!bought?.length)
    return { ok: false, error: "You can review a product once it has been delivered to you." };

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
  if (error) return { ok: false, error: "Could not save your review. Please try again." };
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

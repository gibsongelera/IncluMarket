"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { createNotification, notifyAdmins } from "@/lib/notify";
import { queueEmail } from "@/lib/email/send";
import {
  createCheckoutSession,
  isPayMongoConfigured,
  toCentavos,
} from "@/lib/payments/paymongo";
import { boundedText } from "@/lib/validation/data-url";
import { checkPublicProduct } from "@/lib/catalog";
import { priceCartForBuyer } from "@/lib/pricing/engine";
import type { PricedCart, PricedLine } from "@/lib/pricing/core";
import { failPendingPayment } from "@/lib/payments/stock";
import { isMissingObject } from "@/lib/db-errors";
import { rateLimit } from "@/lib/security/rate-limit";
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
  /** Every order created (one per seller). */
  orderIds?: number[];
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
  let cart: PricedCart;
  try {
    cart = await priceCartForBuyer(session.user_id, selected);
  } catch {
    return { ok: false, error: "We could not reach the shop. Your cart is safe — please try again." };
  }
  if (!cart.lines.length) return { ok: false, error: "Your cart is empty." };
  if (!cart.purchasable) return { ok: false, error: cart.firstProblem || "Please review your cart." };

  const db = createAdminClient();
  const shipping = { name: shippingName, address: shippingAddress, city: shippingCity, phone };
  const cartItemIds = cart.lines.map((l) => l.cartItemId).filter((n): n is number => n != null);
  const groups = cart.groups.filter((g) => g.lines.length);

  // ---- one transaction: checkout, one order per seller, lines, stock -------
  // Migration 0015. A line that no longer fits rolls back everything, so
  // there is no half-written order to unwind (B-07, B-09).
  const { data: placed, error: placeErr } = await db.rpc("im_place_checkout", {
    p: {
      buyer_id: session.user_id,
      payment_provider: paymentMethod,
      shipping,
      cart_item_ids: cartItemIds,
      groups: groups.map((g) => ({
        seller_id: g.sellerId,
        shipping_fee: g.shippingFee,
        lines: g.lines.map(lineRecord),
      })),
    },
  });
  if (placeErr) {
    if (isMissingObject(placeErr)) {
      return placeLegacyOrder(db, session, cart, paymentMethod, shipping);
    }
    return { ok: false, error: friendlyPlaceError(placeErr.message, cart) };
  }

  const checkoutId = Number((placed as { checkout_id: number }).checkout_id);
  const orderIds = ((placed as { order_ids: number[] }).order_ids ?? []).map(Number);
  const total = cart.grandTotal;

  const orderedLines = cart.lines.map((l) => ({ variant_id: l.variantId as number, product_id: l.productId }));
  await alertLowStock(db, orderedLines);
  for (const [i, g] of groups.entries()) {
    const orderId = orderIds[i];
    await createNotification({
      userId: g.sellerId,
      type: "new_order",
      title: `New order #${orderId}`,
      body:
        paymentMethod === "cod"
          ? "Cash on delivery. Please accept and prepare it."
          : "Waiting for the buyer's online payment. You'll be told when it's paid.",
      link: "/seller/orders",
    });
  }
  await db.from("im_audit_logs").insert(
    orderIds.map((id) => ({
      actor_id: session.user_id,
      actor_role: "buyer",
      action: "placed_order",
      target: `order:${id} checkout:${checkoutId}`,
    }))
  );

  // ---- settle --------------------------------------------------------------
  if (paymentMethod === "paymongo") {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const checkout = await createCheckoutSession({
      checkoutId,
      lines: cart.lines.map((l) => ({
        name: checkoutLineName(l),
        amountCentavos: toCentavos(l.unitPrice),
        quantity: l.quantity,
        description: lineDescription(l),
      })),
      shippingCentavos: toCentavos(cart.shippingTotal),
      billing: { name: shippingName, email: session.email, phone },
      successUrl: `${origin}/buyer/orders?paid=${orderIds[0]}`,
      // Back to the same lines (a selection or a Buy now), with the address draft.
      cancelUrl: `${origin}/buyer/checkout?cancelled=${orderIds[0]}${selected?.length ? `&items=${selected.join(",")}` : ""}`,
    });

    if (!checkout.ok) {
      // Give the stock back — the buyer never paid.
      for (const id of orderIds) {
        await failPendingPayment(db, id, "The online payment could not be started. Items released back to stock.");
      }
      await db.from("im_checkouts").update({ payment_status: "failed" }).eq("id", checkoutId);
      return { ok: false, error: checkout.error };
    }

    await db.from("im_checkouts").update({ payment_reference: checkout.sessionId }).eq("id", checkoutId);
    await db.from("im_orders").update({ payment_reference: checkout.sessionId }).in("id", orderIds);

    // The cart is deliberately NOT cleared here. The webhook removes the
    // ordered lines once payment succeeds, so abandoning the hosted checkout
    // page leaves the buyer's cart intact and they can retry.
    revalidatePath("/buyer/orders");
    return { ok: true, orderId: orderIds[0], orderIds, redirectUrl: checkout.checkoutUrl };
  }

  // Cash on delivery: the cart lines were removed inside the transaction.
  await queueEmail(
    "order_confirmation",
    { email: session.email, name: session.name },
    { orderId: orderIds.join(", #"), total, buyerName: session.name, paymentMethod: "cod" }
  );

  revalidatePath("/buyer/orders");
  revalidatePath("/buyer/cart");
  return { ok: true, orderId: orderIds[0], orderIds };
}

/** One order line as im_place_checkout() stores it, with its price breakdown. */
function lineRecord(l: PricedLine) {
  return {
    product_id: l.productId,
    variant_id: l.variantId,
    quantity: l.quantity,
    unit_price: l.unitPrice,
    base_unit_price: l.baseUnitPrice,
    flash_sale_id: l.sale?.id ?? null,
    sale_discount_pct: l.sale?.percent ?? null,
    pwd_rule_id: l.pwd?.ruleId ?? null,
    pwd_rate: l.pwd?.ratePercent ?? null,
    pwd_discount_amount: l.pwd ? Math.round(l.pwd.unitDiscount * l.quantity * 100) / 100 : 0,
    pwd_eligible_amount: l.pwd?.eligibleAmount ?? 0,
    vat_exempt_amount: l.pwd ? Math.round(l.pwd.unitVatExempt * l.quantity * 100) / 100 : 0,
    legal_basis: l.pwd?.legalBasis ?? null,
    verification_id: l.pwd?.verificationId ?? null,
  };
}

function lineDescription(l: PricedLine): string | undefined {
  const parts: string[] = [];
  if (l.sale) parts.push(`${l.sale.percent}% flash sale`);
  if (l.pwd) parts.push(`PWD discount ${l.pwd.ratePercent}% (${l.pwd.legalBasis})`);
  return parts.length ? parts.join("; ") : undefined;
}

function friendlyPlaceError(message: string, cart: PricedCart): string {
  const m = message.match(/(out_of_stock|unavailable):(\d+)/);
  if (m) {
    const title = cart.lines.find((l) => l.productId === Number(m[2]))?.title ?? "an item";
    return m[1] === "out_of_stock"
      ? `Someone just bought the last of ${title}. Please review your cart.`
      : `${title} is no longer available. Please remove it from your cart.`;
  }
  console.error("[placeOrder] im_place_checkout:", message);
  return "Could not place your order. Your cart is safe — please try again.";
}

/**
 * The pre-0015 path: one order for the whole cart, written step by step with
 * compensating restores. Used only while migration 0015 is not applied yet,
 * so code can deploy before the database is migrated.
 */
async function placeLegacyOrder(
  db: ReturnType<typeof createAdminClient>,
  session: { user_id: number; email: string; name: string },
  cart: PricedCart,
  paymentMethod: PaymentMethod,
  shipping: { name: string; address: string; city: string; phone: string }
): Promise<PlaceOrderResult> {
  const lines = cart.lines;
  const total = cart.grandTotal;

  const { data: order, error } = await db
    .from("im_orders")
    .insert({
      buyer_id: session.user_id,
      total_amount: total,
      order_status: "pending",
      payment_status: paymentMethod === "cod" ? "unpaid" : "pending",
      payment_provider: paymentMethod,
      shipping_name: shipping.name,
      shipping_address: shipping.address,
      shipping_city: shipping.city,
      shipping_phone: shipping.phone,
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
    // An order with no lines is worse than no order (B-07). History cascades.
    await db.from("im_orders").delete().eq("id", order.id);
    return { ok: false, error: "Could not place your order. Your cart is safe — please try again." };
  }

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
      return { ok: false, error: `Someone just bought the last of ${line.title}. Please review your cart.` };
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

  if (paymentMethod === "paymongo") {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const checkout = await createCheckoutSession({
      orderId: order.id,
      lines: lines.map((l) => ({
        name: checkoutLineName(l),
        amountCentavos: toCentavos(l.unitPrice),
        quantity: l.quantity,
        description: lineDescription(l),
      })),
      shippingCentavos: toCentavos(cart.shippingTotal),
      billing: { name: shipping.name, email: session.email, phone: shipping.phone },
      successUrl: `${origin}/buyer/orders?paid=${order.id}`,
      cancelUrl: `${origin}/buyer/checkout?cancelled=${order.id}${cartItemIds.length ? `&items=${cartItemIds.join(",")}` : ""}`,
    });
    if (!checkout.ok) {
      for (const r of reserved) {
        await db.rpc("im_restore_variant_stock", { p_variant_id: r.variantId, p_qty: r.qty });
      }
      await db.from("im_orders").update({ payment_status: "failed" }).eq("id", order.id);
      return { ok: false, error: checkout.error };
    }
    await db.from("im_orders").update({ payment_reference: checkout.sessionId }).eq("id", order.id);
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

  const now = new Date().toISOString();
  const base = {
    product_id: productId,
    buyer_id: session.user_id,
    rating_score: rating,
    comment_text: boundedText(comment, 2000),
    created_at: now,
  };
  // Tie the review to the delivered order line behind it (migration 0019);
  // a seller's reply on an earlier version is kept.
  let { error } = await db
    .from("im_product_reviews")
    .upsert({ ...base, order_item_id: bought[0].id, updated_at: now }, { onConflict: "product_id,buyer_id" });
  if (error && isMissingObject(error)) {
    ({ error } = await db.from("im_product_reviews").upsert(base, { onConflict: "product_id,buyer_id" }));
  }
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

/** Reply on one of your own support requests (N-18). */
export async function replyToTicket(ticketId: number, message: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in first." };
  const clean = boundedText(message, 4000);
  if (!clean) return { ok: false, error: "Write a message first." };
  const limited = await rateLimit("ticket_reply", `user:${session.user_id}`, { limit: 30, windowSeconds: 3600 });
  if (!limited.ok) return { ok: false, error: "Too many messages. Please wait a few minutes." };

  const db = createAdminClient();
  const { data: ticket } = await db
    .from("im_support_tickets")
    .select("id, user_id, subject, ticket_status, assigned_to")
    .eq("id", Number(ticketId))
    .maybeSingle();
  if (!ticket || ticket.user_id !== session.user_id) return { ok: false, error: "Support request not found." };

  const { error } = await db.from("im_ticket_responses").insert({
    ticket_id: ticket.id,
    author_role: session.role,
    author_id: session.user_id,
    message: clean,
  });
  if (error) return { ok: false, error: "Could not send your message. Please try again." };
  await db
    .from("im_support_tickets")
    .update({
      ticket_status: ticket.ticket_status === "resolved" ? "open" : ticket.ticket_status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticket.id);
  await db.from("im_audit_logs").insert({
    actor_id: session.user_id,
    actor_role: session.role,
    action: "replied_ticket",
    target: `ticket:${ticket.id}`,
  });
  const note = {
    type: "message" as const,
    title: `Reply on support request #${ticket.id}`,
    body: `${session.name}: ${clean.length > 120 ? `${clean.slice(0, 117)}…` : clean}`,
    link: `/admin/tickets?focus=${ticket.id}`,
  };
  // The admin handling it hears; an unassigned request goes to every admin.
  if (ticket.assigned_to) await createNotification({ userId: ticket.assigned_to, ...note });
  else await notifyAdmins(note);
  revalidatePath("/buyer/support");
  revalidatePath("/seller/support");
  revalidatePath("/admin/tickets");
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
      priority_level: ["low", "medium", "high"].includes(String(priority)) ? priority : "medium",
    })
    .select("*")
    .single();
  if (error || !ticket) return { ok: false, error: "Could not send your request. Please try again." };

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
  // Admins hear about new requests (N-18).
  await notifyAdmins({
    type: "system",
    title: `New support request #${ticket.id}`,
    body: `${session.role === "seller" ? "Seller" : "Buyer"} ${session.name}: ${cleanSubject}`,
    link: `/admin/tickets?focus=${ticket.id}`,
  });
  revalidatePath("/buyer/support");
  revalidatePath("/seller/support");
  return { ok: true };
}

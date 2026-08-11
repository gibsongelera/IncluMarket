"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { clearCartAction, getCartItems } from "@/lib/actions/cart";
import type { Priority } from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  orderId?: number;
}

export async function placeOrder(): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer")
    return { ok: false, error: "Sign in as a buyer to place an order." };

  const items = await getCartItems();
  if (!items.length) return { ok: false, error: "Your cart is empty." };

  const db = createAdminClient();
  const total = items.reduce(
    (n, it) => n + Number(it.unit_price || 0) * Number(it.quantity || 0),
    0
  );

  const { data: order, error } = await db
    .from("im_orders")
    .insert({ buyer_id: session.user_id, total_amount: total, order_status: "pending" })
    .select("*")
    .single();
  if (error || !order) return { ok: false, error: error?.message || "Could not place order." };

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

  // Decrement variant stock (best-effort, floored at 0).
  for (const it of items) {
    if (!it.variant_id) continue;
    const { data: v } = await db
      .from("im_product_variants")
      .select("stock_qty")
      .eq("id", it.variant_id)
      .maybeSingle();
    if (v) {
      await db
        .from("im_product_variants")
        .update({ stock_qty: Math.max(0, v.stock_qty - it.quantity) })
        .eq("id", it.variant_id);
    }
  }

  await clearCartAction();

  await db.from("im_audit_logs").insert({
    actor_id: session.user_id,
    actor_role: "buyer",
    action: "placed_order",
    target: `order:${order.id}`,
  });
  revalidatePath("/buyer/orders");
  revalidatePath("/buyer/cart");
  return { ok: true, orderId: order.id };
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
  const { error } = await db
    .from("im_product_reviews")
    .upsert(
      {
        product_id: productId,
        buyer_id: session.user_id,
        rating_score: rating,
        comment_text: comment?.trim() || null,
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
  const cleanSubject = String(subject || "").trim();
  const cleanDesc = String(description || "").trim();
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

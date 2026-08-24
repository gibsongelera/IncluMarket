"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import type { CartItem } from "@/lib/types";

export interface CartActionResult {
  ok: boolean;
  error?: string;
  count?: number;
}

function revalidateCart() {
  revalidatePath("/buyer/cart");
  revalidatePath("/buyer/checkout");
  revalidatePath("/home");
  revalidatePath("/buyer/product", "layout");
}

export async function getCartItems(): Promise<CartItem[]> {
  const session = await getSession();
  if (!session || session.role !== "buyer") return [];

  const db = createAdminClient();
  const { data: rows } = await db
    .from("im_cart_items")
    .select("id, product_id, variant_id, quantity, created_at, updated_at")
    .eq("user_id", session.user_id)
    .order("created_at", { ascending: true });

  if (!rows?.length) return [];

  const productIds = [...new Set(rows.map((r) => r.product_id))];
  const { data: products } = await db
    .from("im_products")
    .select("id, base_price")
    .in("id", productIds);
  const priceById = new Map((products || []).map((p) => [p.id, Number(p.base_price)]));

  return rows.map((r) => ({
    id: r.id,
    product_id: r.product_id,
    variant_id: r.variant_id ?? 0,
    quantity: r.quantity,
    unit_price: priceById.get(r.product_id) ?? 0,
    added_at: r.created_at,
  }));
}

// Every export of a "use server" module is a public HTTP endpoint, so this
// deliberately takes no user id: a caller-supplied id used to win over the
// session id, which let any buyer enumerate other buyers' cart counts.
export async function getCartCount(): Promise<number> {
  const session = await getSession();
  if (!session || session.role !== "buyer") return 0;
  const db = createAdminClient();
  const { data } = await db
    .from("im_cart_items")
    .select("quantity")
    .eq("user_id", session.user_id);
  return (data || []).reduce((n, r) => n + Number(r.quantity || 0), 0);
}

export async function addToCartAction(
  productId: number,
  variantId: number | null,
  quantity: number,
  stockCap = Infinity
): Promise<CartActionResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer")
    return { ok: false, error: "Sign in as a buyer to add items." };

  const qty = Math.max(1, Number(quantity) || 1);
  const db = createAdminClient();

  let q = db
    .from("im_cart_items")
    .select("id, quantity")
    .eq("user_id", session.user_id)
    .eq("product_id", productId);
  q = variantId == null ? q.is("variant_id", null) : q.eq("variant_id", variantId);
  const { data: existing } = await q.maybeSingle();

  if (existing) {
    const next = Math.min(existing.quantity + qty, stockCap);
    const { error } = await db
      .from("im_cart_items")
      .update({ quantity: next, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await db.from("im_cart_items").insert({
      user_id: session.user_id,
      product_id: productId,
      variant_id: variantId,
      quantity: Math.min(qty, stockCap),
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidateCart();
  return { ok: true, count: await getCartCount() };
}

export async function setCartQuantityAction(
  productId: number,
  variantId: number | null,
  quantity: number,
  stockCap = Infinity
): Promise<CartActionResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer")
    return { ok: false, error: "Sign in as a buyer." };

  const next = Math.max(1, Math.min(stockCap, Number(quantity) || 1));
  const db = createAdminClient();

  let q = db
    .from("im_cart_items")
    .update({ quantity: next, updated_at: new Date().toISOString() })
    .eq("user_id", session.user_id)
    .eq("product_id", productId);
  q = variantId == null || variantId === 0 ? q.is("variant_id", null) : q.eq("variant_id", variantId);
  const { error } = await q;
  if (error) return { ok: false, error: error.message };

  revalidateCart();
  return { ok: true, count: await getCartCount() };
}

export async function removeFromCartAction(
  productId: number,
  variantId: number | null
): Promise<CartActionResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer")
    return { ok: false, error: "Sign in as a buyer." };

  const db = createAdminClient();
  let q = db
    .from("im_cart_items")
    .delete()
    .eq("user_id", session.user_id)
    .eq("product_id", productId);
  q = variantId == null || variantId === 0 ? q.is("variant_id", null) : q.eq("variant_id", variantId);
  const { error } = await q;
  if (error) return { ok: false, error: error.message };

  revalidateCart();
  return { ok: true, count: await getCartCount() };
}

export async function clearCartAction(): Promise<CartActionResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer")
    return { ok: false, error: "Sign in as a buyer." };

  const { error } = await createAdminClient()
    .from("im_cart_items")
    .delete()
    .eq("user_id", session.user_id);
  if (error) return { ok: false, error: error.message };

  revalidateCart();
  return { ok: true, count: 0 };
}

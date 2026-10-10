"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { checkPublicProduct } from "@/lib/catalog";
import { MAX_LINE_QUANTITY } from "@/lib/pricing/constants";

export interface CartActionResult {
  ok: boolean;
  error?: string;
  /** Non-blocking information, e.g. the quantity was lowered to the stock. */
  notice?: string;
  count?: number;
}

function revalidateCart() {
  revalidatePath("/buyer/cart");
  revalidatePath("/buyer/checkout");
  revalidatePath("/home");
  revalidatePath("/buyer/product", "layout");
}

function toInt(n: unknown): number | null {
  const v = Number(n);
  return Number.isInteger(v) && v > 0 ? v : null;
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

/**
 * Resolve the variant a buyer may put in a cart, re-reading everything.
 *
 * This used to trust the caller twice: a `stockCap` argument (default
 * Infinity — omit it and there was no cap at all) and a variant id that was
 * never checked against the product. Pairing a cheap product with another
 * product's expensive variant priced the line at the cheap product and
 * decremented the expensive variant's stock (N-01).
 */
async function resolveVariant(
  db: ReturnType<typeof createAdminClient>,
  productId: number,
  variantId: number | null
): Promise<{ ok: true; stock: number; title: string } | { ok: false; error: string }> {
  const visible = await checkPublicProduct(db, productId);
  if (!visible.ok || !visible.product) return { ok: false, error: visible.error || "This item is not available right now." };

  const { data: variants, error } = await db
    .from("im_product_variants")
    .select("id, stock_qty")
    .eq("product_id", productId);
  if (error) return { ok: false, error: "We could not reach the shop. Please try again." };
  if (!variants?.length) return { ok: false, error: "This item cannot be ordered yet." };

  const variant = variantId != null ? variants.find((v) => v.id === variantId) : undefined;
  if (!variant) return { ok: false, error: "Please choose a colour or size first." };

  const stock = Number(variant.stock_qty) || 0;
  if (stock <= 0) return { ok: false, error: `${visible.product.title} is sold out in that option.` };
  return { ok: true, stock, title: visible.product.title };
}

export async function addToCartAction(
  productId: number,
  variantId: number | null,
  quantity: number
): Promise<CartActionResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer")
    return { ok: false, error: "Sign in as a buyer to add items." };

  const pid = toInt(productId);
  if (!pid) return { ok: false, error: "This item is not available right now." };
  const vid = variantId == null ? null : toInt(variantId);
  const wanted = Math.max(1, Math.min(MAX_LINE_QUANTITY, Math.floor(Number(quantity) || 1)));

  const db = createAdminClient();
  const resolved = await resolveVariant(db, pid, vid);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  let q = db
    .from("im_cart_items")
    .select("id, quantity")
    .eq("user_id", session.user_id)
    .eq("product_id", pid);
  q = vid == null ? q.is("variant_id", null) : q.eq("variant_id", vid);
  const { data: existing } = await q.maybeSingle();

  const ceiling = Math.min(resolved.stock, MAX_LINE_QUANTITY);
  const desired = (existing?.quantity ?? 0) + wanted;
  const next = Math.min(desired, ceiling);
  const notice =
    next < desired ? `Only ${resolved.stock} available — your cart now has ${next}.` : undefined;

  if (existing) {
    const { error } = await db
      .from("im_cart_items")
      .update({ quantity: next, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return { ok: false, error: "Could not update your cart. Please try again." };
  } else {
    const { error } = await db.from("im_cart_items").insert({
      user_id: session.user_id,
      product_id: pid,
      variant_id: vid,
      quantity: next,
    });
    if (error) return { ok: false, error: "Could not add to your cart. Please try again." };
  }

  revalidateCart();
  return { ok: true, notice, count: await getCartCount() };
}

/** Change a cart line's quantity. The line is identified by its own id. */
export async function setCartQuantityAction(
  cartItemId: number,
  quantity: number
): Promise<CartActionResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer")
    return { ok: false, error: "Sign in as a buyer." };

  const id = toInt(cartItemId);
  if (!id) return { ok: false, error: "That item is no longer in your cart." };

  const db = createAdminClient();
  const { data: line } = await db
    .from("im_cart_items")
    .select("id, product_id, variant_id")
    .eq("id", id)
    .eq("user_id", session.user_id)
    .maybeSingle();
  if (!line) return { ok: false, error: "That item is no longer in your cart." };

  const resolved = await resolveVariant(db, line.product_id, line.variant_id);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const wanted = Math.max(1, Math.floor(Number(quantity) || 1));
  const next = Math.min(wanted, resolved.stock, MAX_LINE_QUANTITY);
  const { error } = await db
    .from("im_cart_items")
    .update({ quantity: next, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", session.user_id);
  if (error) return { ok: false, error: "Could not update the quantity. Please try again." };

  revalidateCart();
  return {
    ok: true,
    notice: next < wanted ? `Only ${resolved.stock} available.` : undefined,
    count: await getCartCount(),
  };
}

export async function removeFromCartAction(cartItemId: number): Promise<CartActionResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer")
    return { ok: false, error: "Sign in as a buyer." };

  const id = toInt(cartItemId);
  if (!id) return { ok: false, error: "That item is no longer in your cart." };

  const { error } = await createAdminClient()
    .from("im_cart_items")
    .delete()
    .eq("id", id)
    .eq("user_id", session.user_id);
  if (error) return { ok: false, error: "Could not remove the item. Please try again." };

  revalidateCart();
  return { ok: true, count: await getCartCount() };
}

// There is deliberately no "clear cart" action. Checkout removes exactly the
// lines it ordered (placeOrder for cash on delivery, the payment webhook for
// online payment); a whole-cart delete exported here would only be one more
// public endpoint with no UI.

/**
 * Buy now (C-29): put exactly this quantity of this option in the cart and
 * return the line, so checkout can order that line alone. Other cart lines
 * are untouched. Same checks as Add to cart.
 */
export async function buyNowAction(
  productId: number,
  variantId: number | null,
  quantity: number
): Promise<CartActionResult & { cartItemId?: number }> {
  const session = await getSession();
  if (!session || session.role !== "buyer") return { ok: false, error: "Sign in as a buyer to buy." };
  const pid = toInt(productId);
  if (!pid) return { ok: false, error: "This item is not available right now." };
  const vid = variantId == null ? null : toInt(variantId);
  const wanted = Math.max(1, Math.min(MAX_LINE_QUANTITY, Math.floor(Number(quantity) || 1)));

  const db = createAdminClient();
  const resolved = await resolveVariant(db, pid, vid);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const qty = Math.min(wanted, resolved.stock, MAX_LINE_QUANTITY);
  if (qty < 1) return { ok: false, error: "This option is sold out." };
  const notice = qty < wanted ? `Only ${resolved.stock} available — buying ${qty}.` : undefined;

  let q = db.from("im_cart_items").select("id").eq("user_id", session.user_id).eq("product_id", pid);
  q = vid == null ? q.is("variant_id", null) : q.eq("variant_id", vid);
  const { data: existing } = await q.maybeSingle();

  let cartItemId: number | undefined;
  if (existing) {
    const { error } = await db
      .from("im_cart_items")
      .update({ quantity: qty, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return { ok: false, error: "Could not start checkout. Please try again." };
    cartItemId = existing.id;
  } else {
    const { data, error } = await db
      .from("im_cart_items")
      .insert({ user_id: session.user_id, product_id: pid, variant_id: vid, quantity: qty })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: "Could not start checkout. Please try again." };
    cartItemId = data.id;
  }
  revalidateCart();
  return { ok: true, notice, cartItemId, count: await getCartCount() };
}

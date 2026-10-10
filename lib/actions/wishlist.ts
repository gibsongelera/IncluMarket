"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { checkPublicProduct } from "@/lib/catalog";
import { addToCartAction } from "./cart";

export interface WishlistActionResult {
  ok: boolean;
  error?: string;
  inWishlist?: boolean;
}

function revalidateWishlist() {
  revalidatePath("/buyer/wishlist");
  revalidatePath("/home");
  revalidatePath("/buyer/product", "layout");
}

export async function toggleWishlistAction(productId: number): Promise<WishlistActionResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer")
    return { ok: false, error: "Sign in as a buyer to save items." };

  const db = createAdminClient();
  const { data: existing } = await db
    .from("im_wishlists")
    .select("id")
    .eq("user_id", session.user_id)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing) {
    const { error } = await db.from("im_wishlists").delete().eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    revalidateWishlist();
    return { ok: true, inWishlist: false };
  }

  // Saving is only allowed for listings the public can see. Removing (above)
  // always works, so a buyer can clean out an item that was later flagged.
  const visible = await checkPublicProduct(db, productId);
  if (!visible.ok) return { ok: false, error: visible.error };

  const { error } = await db
    .from("im_wishlists")
    .insert({ user_id: session.user_id, product_id: productId });
  if (error) return { ok: false, error: error.message };

  revalidateWishlist();
  return { ok: true, inWishlist: true };
}

export async function removeFromWishlistAction(productId: number): Promise<WishlistActionResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer") return { ok: false, error: "Sign in as a buyer." };
  const { error } = await createAdminClient()
    .from("im_wishlists")
    .delete()
    .eq("user_id", session.user_id)
    .eq("product_id", Number(productId));
  if (error) return { ok: false, error: "Could not remove it. Please try again." };
  revalidateWishlist();
  return { ok: true, inWishlist: false };
}

/**
 * Wishlist → cart (C-15). Adds the chosen variant through the same checks as
 * "Add to cart" (listing for sale, variant belongs to it, stock), and only
 * then removes the save — a failed add leaves the wishlist as it was.
 */
export async function moveWishlistToCartAction(
  productId: number,
  variantId: number | null
): Promise<WishlistActionResult & { notice?: string; cartCount?: number }> {
  const session = await getSession();
  if (!session || session.role !== "buyer") return { ok: false, error: "Sign in as a buyer." };
  const added = await addToCartAction(productId, variantId, 1);
  if (!added.ok) return { ok: false, error: added.error };
  await createAdminClient()
    .from("im_wishlists")
    .delete()
    .eq("user_id", session.user_id)
    .eq("product_id", Number(productId));
  revalidateWishlist();
  revalidatePath("/buyer/cart");
  return { ok: true, inWishlist: false, notice: added.notice, cartCount: added.count };
}

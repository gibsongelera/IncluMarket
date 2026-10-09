"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { checkPublicProduct } from "@/lib/catalog";

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

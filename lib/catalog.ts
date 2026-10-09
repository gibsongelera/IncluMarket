import "server-only";
import { createAdminClient } from "./supabase/admin";

/**
 * Catalog visibility rules, in one place.
 *
 * A product is PUBLIC — viewable by anyone, addable to a cart, orderable,
 * wishlistable and reviewable — only when it is `approved` AND its seller's
 * account is `active`. Before this module existed, getProductById had no status
 * filter at all, so a pending or flagged listing could be opened and bought by
 * guessing its URL, and a suspended seller's products stayed on sale.
 *
 * Plain server-only module (not "use server"): nothing here is a public
 * endpoint. Actions call it after their own session check.
 */

type Db = ReturnType<typeof createAdminClient>;

export interface PublicProductCheck {
  ok: boolean;
  /** User-facing reason when !ok. Never reveals whether the id exists. */
  error?: string;
  product?: { id: number; seller_id: number; title: string; status: string };
}

export const UNAVAILABLE_MESSAGE = "This item is not available right now.";

/** Is this product visible and purchasable by the public? */
export async function checkPublicProduct(db: Db, productId: number): Promise<PublicProductCheck> {
  if (!Number.isInteger(productId) || productId <= 0) return { ok: false, error: UNAVAILABLE_MESSAGE };

  const { data: product, error } = await db
    .from("im_products")
    .select("id, seller_id, title, status")
    .eq("id", productId)
    .maybeSingle();
  if (error) return { ok: false, error: "We could not reach the shop. Please try again." };
  if (!product || product.status !== "approved") return { ok: false, error: UNAVAILABLE_MESSAGE };

  const { data: seller } = await db
    .from("im_profiles")
    .select("account_status")
    .eq("id", product.seller_id)
    .maybeSingle();
  if (!seller || seller.account_status !== "active") return { ok: false, error: UNAVAILABLE_MESSAGE };

  return { ok: true, product };
}

import "server-only";
import { createAdminClient } from "./supabase/admin";
import { isMissingObject } from "./db-errors";

/**
 * Catalog visibility rules, in one place.
 *
 * A product is PUBLIC — viewable by anyone, addable to a cart, orderable,
 * wishlistable and reviewable — only when it is `approved` AND its seller may
 * sell: the account is `active` and the seller is a verified PWD, or still in
 * the grace period given to sellers who joined before verification existed
 * (migration 0017, client requirement §6 / B-15).
 *
 * Before this module, getProductById had no status filter at all, so a
 * pending or flagged listing could be opened and bought by guessing its URL,
 * and a suspended seller's products stayed on sale.
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

/**
 * Of these seller ids, the ones allowed to sell right now.
 *
 * Throws on a database error (callers decide how to degrade). Before
 * migration 0017 there is no verification yet, so "active" is the whole rule.
 */
export async function sellersWhoCanSell(db: Db, sellerIds: number[]): Promise<Set<number>> {
  const ids = [...new Set(sellerIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return new Set();

  const withGrace = await db.from("im_profiles").select("id, account_status, pwd_grace_until").in("id", ids);
  if (withGrace.error && !isMissingObject(withGrace.error)) throw new Error(withGrace.error.message);
  if (withGrace.error) {
    const legacy = await db.from("im_profiles").select("id, account_status").in("id", ids);
    if (legacy.error) throw new Error(legacy.error.message);
    return new Set((legacy.data ?? []).filter((p) => p.account_status === "active").map((p) => p.id as number));
  }

  const verified = await db.from("im_verified_pwd").select("profile_id").in("profile_id", ids);
  if (verified.error && !isMissingObject(verified.error)) throw new Error(verified.error.message);
  const verifiedIds = new Set((verified.data ?? []).map((v) => v.profile_id as number));
  const now = Date.now();

  return new Set(
    (withGrace.data ?? [])
      .filter((p) => p.account_status === "active")
      .filter(
        (p) =>
          verifiedIds.has(p.id as number) ||
          (p.pwd_grace_until != null && new Date(p.pwd_grace_until as string).getTime() > now)
      )
      .map((p) => p.id as number)
  );
}

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

  try {
    const sellable = await sellersWhoCanSell(db, [product.seller_id]);
    if (!sellable.has(product.seller_id)) return { ok: false, error: UNAVAILABLE_MESSAGE };
  } catch {
    return { ok: false, error: "We could not reach the shop. Please try again." };
  }
  return { ok: true, product };
}

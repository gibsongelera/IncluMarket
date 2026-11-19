"use server";

import { guardByIp } from "@/lib/security/rate-limit";
import { suggestFromStorefront } from "@/lib/storefront";
import type { Suggestions } from "@/lib/storefront-core";

/**
 * Header search suggestions: matching products (with photo and the price the
 * buyer pays), categories and sellers, typo-tolerant. Public data only, from
 * the same storefront rules as the shop — a listing that is not for sale is
 * never suggested.
 *
 * Unauthenticated and called on every pause in typing, so it is rate limited
 * by network.
 */
export async function suggestProducts(query: string): Promise<Suggestions> {
  const empty: Suggestions = { products: [], categories: [], sellers: [] };
  const q = String(query ?? "").trim().slice(0, 80);
  if (q.length < 2) return empty;
  const guard = await guardByIp("search", { limit: 120, windowSeconds: 60 });
  if (guard) return empty;
  try {
    return await suggestFromStorefront(q);
  } catch {
    return empty;
  }
}

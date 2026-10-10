import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DataUnavailableError, getFeaturedSellers } from "@/lib/data";
import { isMissingObject } from "@/lib/db-errors";
import { sellersWhoCanSell } from "@/lib/catalog";
import { verifiedAmongIfAvailable } from "@/lib/pwd/data";
import { searchStorefront } from "@/lib/storefront";

/**
 * Public seller shops (C-23). Only what a buyer should see: name, story,
 * shop banner and logo, city, the verified badge, rating and listings —
 * never contact details or disability information. A seller who may not
 * sell (unverified past the grace period, suspended) has no public shop.
 */

export interface ShopLite {
  id: number;
  name: string;
  story: string | null;
  banner: string | null;
  logo: string | null;
  city: string | null;
  verified: boolean;
  since: string;
  productCount: number;
  rating: { average: number; count: number };
}

export interface FeaturedShopLite {
  id: number;
  name: string;
  story: string | null;
  verified: boolean;
}

type ProfileRow = {
  id: number;
  name: string;
  role: string;
  account_status: string;
  seller_story: string | null;
  created_at: string;
  shop_name?: string | null;
  shop_logo_url?: string | null;
  shop_banner_url?: string | null;
  pickup_city?: string | null;
};

export async function getPublicShop(sellerId: number): Promise<ShopLite | null> {
  if (!Number.isInteger(sellerId) || sellerId <= 0) return null;
  const db = createAdminClient();
  let res = await db
    .from("im_profiles")
    .select("id, name, role, account_status, seller_story, created_at, shop_name, shop_logo_url, shop_banner_url, pickup_city")
    .eq("id", sellerId)
    .maybeSingle();
  if (res.error && isMissingObject(res.error)) {
    // Before migration 0019: no shop fields yet.
    res = await db
      .from("im_profiles")
      .select("id, name, role, account_status, seller_story, created_at")
      .eq("id", sellerId)
      .maybeSingle();
  }
  if (res.error) throw new DataUnavailableError("this shop");
  const p = res.data as ProfileRow | null;
  if (!p || p.role !== "seller" || p.account_status !== "active") return null;
  if (!(await sellersWhoCanSell(db, [p.id])).has(p.id)) return null;

  const [verified, listings] = await Promise.all([
    verifiedAmongIfAvailable([p.id]),
    searchStorefront({ seller: p.id, sort: "top_sales", pageSize: 60 }),
  ]);
  let sum = 0;
  let count = 0;
  for (const i of listings.items) {
    sum += i.ratingAvg * i.ratingCount;
    count += i.ratingCount;
  }
  return {
    id: p.id,
    name: p.shop_name || p.name,
    story: p.seller_story,
    banner: p.shop_banner_url ?? null,
    logo: p.shop_logo_url ?? null,
    city: p.pickup_city ?? null,
    verified: Boolean(verified?.has(p.id)),
    since: p.created_at,
    productCount: listings.total,
    rating: { average: count ? sum / count : 0, count },
  };
}

/**
 * Featured sellers for the homepage: active, allowed to sell, and — once
 * verification exists — verified (only verified sellers can be featured).
 */
export async function getFeaturedShops(): Promise<FeaturedShopLite[]> {
  const sellers = await getFeaturedSellers();
  if (!sellers.length) return [];
  const db = createAdminClient();
  const ids = sellers.map((s) => s.id);
  const [canSell, verified] = await Promise.all([sellersWhoCanSell(db, ids), verifiedAmongIfAvailable(ids)]);
  return sellers
    .filter((s) => canSell.has(s.id) && (verified === null || verified.has(s.id)))
    .map((s) => ({ id: s.id, name: s.name, story: s.seller_story ?? null, verified: Boolean(verified?.has(s.id)) }));
}

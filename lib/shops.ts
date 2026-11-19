import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DataUnavailableError, getFeaturedSellers } from "@/lib/data";
import { isMissingObject } from "@/lib/db-errors";
import { sellersWhoCanSell } from "@/lib/catalog";
import { verifiedAmongIfAvailable } from "@/lib/pwd/data";
import { getListingCountsBySeller, searchStorefront } from "@/lib/storefront";
import type { Profile } from "@/lib/types";

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

/** A store card on /home (05 #7). Public fields only, like ShopLite. */
export interface FeaturedShopLite {
  id: number;
  /** The shop's name, else the seller's name (as the shop page shows it). */
  name: string;
  story: string | null;
  /** The shop logo (migration 0019), else null: the card shows the initial. */
  logo: string | null;
  verified: boolean;
  /** Live listings, the same count as the shop page's. */
  productCount: number;
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

/** getFeaturedSellers reads `*`: the shop columns are there once 0019 is applied. */
type FeaturedSellerRow = Profile & { shop_name?: string | null; shop_logo_url?: string | null };

/**
 * Featured sellers for the homepage: active, allowed to sell, and — once
 * verification exists — verified (only verified sellers can be featured).
 * Each is shaped down to the public card fields here; the profile row it
 * came from (email, phone, disability data) never leaves this function.
 * The listing counts are one read for all of them, alongside the checks.
 */
export async function getFeaturedShops(): Promise<FeaturedShopLite[]> {
  const sellers = (await getFeaturedSellers()) as FeaturedSellerRow[];
  if (!sellers.length) return [];
  const db = createAdminClient();
  const ids = sellers.map((s) => s.id);
  const [canSell, verified, listings] = await Promise.all([
    sellersWhoCanSell(db, ids),
    verifiedAmongIfAvailable(ids),
    getListingCountsBySeller(ids),
  ]);
  return sellers
    .filter((s) => canSell.has(s.id) && (verified === null || verified.has(s.id)))
    .map((s) => ({
      id: s.id,
      name: s.shop_name || s.name,
      story: s.seller_story ?? null,
      logo: s.shop_logo_url || null,
      verified: Boolean(verified?.has(s.id)),
      productCount: listings.get(s.id) ?? 0,
    }));
}

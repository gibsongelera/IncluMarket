import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DataUnavailableError, getDisplayNames } from "@/lib/data";
import { isMissingObject } from "@/lib/db-errors";
import { shortName } from "@/lib/format";

/**
 * Reviews as the public and sellers see them (C-18). Hidden reviews
 * (migration 0019 moderation) are left out, reviewer names are shortened
 * ("Maria S."), and each review says whether it comes from a delivered order.
 * The buyer's id never leaves the server.
 */

export interface ReviewLite {
  id: number;
  productId: number;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewer: string;
  verifiedPurchase: boolean;
  sellerReply: string | null;
  sellerReplyAt: string | null;
}

export interface RatingSummary {
  average: number;
  count: number;
  /** Index 0 is 1 star … index 4 is 5 stars. */
  byStars: [number, number, number, number, number];
}

interface Row {
  id: number;
  product_id: number;
  buyer_id: number;
  rating_score: number;
  comment_text: string | null;
  created_at: string;
  order_item_id?: number | null;
  seller_reply?: string | null;
  seller_reply_at?: string | null;
}

async function readRows(productIds: number[]): Promise<Row[]> {
  const db = createAdminClient();
  const ids = [...new Set(productIds)];
  if (!ids.length) return [];
  const full = await db
    .from("im_product_reviews")
    .select("id, product_id, buyer_id, rating_score, comment_text, created_at, order_item_id, seller_reply, seller_reply_at, status")
    .in("product_id", ids)
    .eq("status", "visible")
    .order("created_at", { ascending: false });
  if (!full.error) return (full.data ?? []) as Row[];
  if (!isMissingObject(full.error)) {
    console.error(`[reviews] ${full.error.message}`);
    throw new DataUnavailableError("reviews");
  }
  // Before migration 0019: no moderation or replies yet.
  const basic = await db
    .from("im_product_reviews")
    .select("id, product_id, buyer_id, rating_score, comment_text, created_at")
    .in("product_id", ids)
    .order("created_at", { ascending: false });
  if (basic.error) throw new DataUnavailableError("reviews");
  return (basic.data ?? []) as Row[];
}

/** Buyers with a delivered order line for each product. */
async function deliveredBuyers(productIds: number[]): Promise<Map<number, Set<number>>> {
  const db = createAdminClient();
  const out = new Map<number, Set<number>>();
  if (!productIds.length) return out;
  const { data: lines } = await db.from("im_order_items").select("order_id, product_id").in("product_id", productIds);
  const list = (lines ?? []) as { order_id: number; product_id: number }[];
  const orderIds = [...new Set(list.map((l) => l.order_id))];
  if (!orderIds.length) return out;
  const { data: orders } = await db
    .from("im_orders")
    .select("id, buyer_id")
    .in("id", orderIds)
    .eq("order_status", "delivered");
  const buyerOf = new Map(((orders ?? []) as { id: number; buyer_id: number }[]).map((o) => [o.id, o.buyer_id]));
  for (const l of list) {
    const buyer = buyerOf.get(l.order_id);
    if (buyer == null) continue;
    if (!out.has(l.product_id)) out.set(l.product_id, new Set());
    out.get(l.product_id)!.add(buyer);
  }
  return out;
}

export async function getReviewsLite(productIds: number[]): Promise<ReviewLite[]> {
  const rows = await readRows(productIds);
  if (!rows.length) return [];
  const [names, delivered] = await Promise.all([
    getDisplayNames(rows.map((r) => r.buyer_id)),
    deliveredBuyers([...new Set(rows.map((r) => r.product_id))]),
  ]);
  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    rating: r.rating_score,
    comment: r.comment_text,
    createdAt: r.created_at,
    reviewer: shortName(names[r.buyer_id]),
    verifiedPurchase: Boolean(r.order_item_id) || Boolean(delivered.get(r.product_id)?.has(r.buyer_id)),
    sellerReply: r.seller_reply ?? null,
    sellerReplyAt: r.seller_reply_at ?? null,
  }));
}

export function summarize(reviews: Pick<ReviewLite, "rating">[]): RatingSummary {
  const byStars: RatingSummary["byStars"] = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const r of reviews) {
    const s = Math.min(5, Math.max(1, Math.round(r.rating)));
    byStars[s - 1]++;
    sum += s;
  }
  return { average: reviews.length ? sum / reviews.length : 0, count: reviews.length, byStars };
}

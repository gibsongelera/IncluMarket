import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminClient>;

/**
 * The seller(s) an order belongs to.
 *
 * From migration 0015 every order has exactly one seller (im_orders.seller_id);
 * older orders are derived from their lines. Returned sorted and unique.
 */
export async function orderSellerIds(db: Db, orderId: number): Promise<number[]> {
  const { data: order, error } = await db.from("im_orders").select("seller_id").eq("id", orderId).maybeSingle();
  if (!error && order?.seller_id) return [order.seller_id as number];

  const { data: lines } = await db.from("im_order_items").select("product_id").eq("order_id", orderId);
  const productIds = [...new Set((lines ?? []).map((l) => l.product_id).filter(Boolean))] as number[];
  if (!productIds.length) return [];
  const { data: owners } = await db.from("im_products").select("seller_id").in("id", productIds);
  return [...new Set((owners ?? []).map((p) => p.seller_id as number))].sort((a, b) => a - b);
}

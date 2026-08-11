"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";

export interface ActionResult {
  ok: boolean;
  error?: string;
  productId?: number;
}

export interface VariantInput {
  id?: number | null;
  color_name: string;
  size: string;
  stock_qty: number;
  sku_code: string;
}

export interface ProductInput {
  title: string;
  description: string;
  base_price: number;
  category: string;
  image: string;
  images?: string[];
  variants: VariantInput[];
}

async function replaceImages(
  db: ReturnType<typeof createAdminClient>,
  productId: number,
  images: string[]
) {
  await db.from("im_product_images").delete().eq("product_id", productId);
  const rows = (images || []).slice(0, 3).map((url, i) => ({
    product_id: productId,
    url,
    position: i,
  }));
  if (rows.length) await db.from("im_product_images").insert(rows);
}

async function requireSeller() {
  const session = await getSession();
  if (!session || (session.role !== "seller" && session.role !== "admin")) return null;
  return session;
}

export async function createProduct(input: ProductInput): Promise<ActionResult> {
  const seller = await requireSeller();
  if (!seller) return { ok: false, error: "Seller access required." };
  if (!input.title?.trim()) return { ok: false, error: "Title is required." };
  if (!(input.base_price >= 0)) return { ok: false, error: "Price must be 0 or more." };

  const db = createAdminClient();
  const { data: product, error } = await db
    .from("im_products")
    .insert({
      seller_id: seller.user_id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      base_price: input.base_price,
      category: input.category || null,
      image: input.image || "\u{1F6CD}\u{FE0F}",
      status: "pending",
    })
    .select("*")
    .single();
  if (error || !product) return { ok: false, error: error?.message || "Could not create product." };

  const variants = (input.variants || []).filter((v) => v.color_name && v.sku_code);
  if (variants.length) {
    const { error: vErr } = await db.from("im_product_variants").insert(
      variants.map((v) => ({
        product_id: product.id,
        color_name: v.color_name,
        size: v.size || null,
        stock_qty: Math.max(0, Number(v.stock_qty) || 0),
        sku_code: v.sku_code,
      }))
    );
    if (vErr) return { ok: false, error: vErr.message };
  }

  if (input.images) await replaceImages(db, product.id, input.images);

  await db.from("im_audit_logs").insert({
    actor_id: seller.user_id,
    actor_role: seller.role,
    action: "created_product",
    target: `product:${product.id}`,
  });
  revalidatePath("/seller/products");
  revalidatePath("/buyer/home");
  return { ok: true, productId: product.id };
}

export async function updateProduct(
  productId: number,
  input: Partial<ProductInput>
): Promise<ActionResult> {
  const seller = await requireSeller();
  if (!seller) return { ok: false, error: "Seller access required." };
  const db = createAdminClient();

  const { data: existing } = await db
    .from("im_products")
    .select("seller_id")
    .eq("id", productId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Product not found." };
  if (seller.role !== "admin" && existing.seller_id !== seller.user_id)
    return { ok: false, error: "You can only edit your own products." };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.base_price !== undefined) patch.base_price = input.base_price;
  if (input.category !== undefined) patch.category = input.category || null;
  if (input.image !== undefined) patch.image = input.image;

  const { error } = await db.from("im_products").update(patch).eq("id", productId);
  if (error) return { ok: false, error: error.message };

  // Sync variants: remove deleted, update kept, insert new.
  if (input.variants) {
    const incoming = input.variants.filter((v) => v.color_name && v.sku_code);
    const { data: existingVariants } = await db
      .from("im_product_variants")
      .select("id")
      .eq("product_id", productId);
    const keepIds = incoming.filter((v) => v.id).map((v) => Number(v.id));
    for (const ev of existingVariants ?? []) {
      if (!keepIds.includes(ev.id)) await db.from("im_product_variants").delete().eq("id", ev.id);
    }
    for (const v of incoming) {
      const payload = {
        color_name: v.color_name,
        size: v.size || null,
        stock_qty: Math.max(0, Number(v.stock_qty) || 0),
        sku_code: v.sku_code,
      };
      if (v.id) {
        await db.from("im_product_variants").update(payload).eq("id", Number(v.id));
      } else {
        await db.from("im_product_variants").insert({ product_id: productId, ...payload });
      }
    }
  }

  if (input.images) await replaceImages(db, productId, input.images);

  await db.from("im_audit_logs").insert({
    actor_id: seller.user_id,
    actor_role: seller.role,
    action: "updated_product",
    target: `product:${productId}`,
  });
  revalidatePath("/seller/products");
  revalidatePath("/buyer/home");
  return { ok: true, productId };
}

const ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "returned"] as const;
type OrderStatusValue = (typeof ORDER_STATUSES)[number];

export async function updateOrderStatus(
  orderId: number,
  status: OrderStatusValue
): Promise<ActionResult> {
  const seller = await requireSeller();
  if (!seller) return { ok: false, error: "Seller access required." };
  if (!ORDER_STATUSES.includes(status)) return { ok: false, error: "Invalid status." };
  const db = createAdminClient();

  // Verify the seller has at least one product line in this order (admins bypass).
  if (seller.role !== "admin") {
    const { data: mine } = await db
      .from("im_products")
      .select("id")
      .eq("seller_id", seller.user_id);
    const myIds = (mine ?? []).map((p) => p.id);
    const { data: lines } = await db
      .from("im_order_items")
      .select("product_id")
      .eq("order_id", orderId);
    const owns = (lines ?? []).some((l) => l.product_id != null && myIds.includes(l.product_id));
    if (!owns) return { ok: false, error: "This order has none of your products." };
  }

  const { error } = await db.from("im_orders").update({ order_status: status }).eq("id", orderId);
  if (error) return { ok: false, error: error.message };
  await db.from("im_audit_logs").insert({
    actor_id: seller.user_id,
    actor_role: seller.role,
    action: `order_status_${status}`,
    target: `order:${orderId}`,
  });
  revalidatePath("/seller/orders");
  revalidatePath("/buyer/orders");
  return { ok: true };
}

export async function deleteProduct(productId: number): Promise<ActionResult> {
  const seller = await requireSeller();
  if (!seller) return { ok: false, error: "Seller access required." };
  const db = createAdminClient();
  const { data: existing } = await db
    .from("im_products")
    .select("seller_id")
    .eq("id", productId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Product not found." };
  if (seller.role !== "admin" && existing.seller_id !== seller.user_id)
    return { ok: false, error: "You can only delete your own products." };

  const { error } = await db.from("im_products").delete().eq("id", productId);
  if (error) return { ok: false, error: error.message };
  await db.from("im_audit_logs").insert({
    actor_id: seller.user_id,
    actor_role: seller.role,
    action: "deleted_product",
    target: `product:${productId}`,
  });
  revalidatePath("/seller/products");
  return { ok: true };
}

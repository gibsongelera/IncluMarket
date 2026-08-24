"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { createNotification } from "@/lib/notify";
import {
  boundedText,
  validateImageDataUrls,
  validateImageToken,
} from "@/lib/validation/data-url";

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

  // The 1 MB / image-only check in SellerProductsClient runs in the browser and
  // is therefore advisory. This is the enforcing one.
  const imageCheck = validateImageDataUrls(input.images);
  if (!imageCheck.ok) return { ok: false, error: imageCheck.error };

  const db = createAdminClient();
  const { data: product, error } = await db
    .from("im_products")
    .insert({
      seller_id: seller.user_id,
      title: boundedText(input.title, 200) ?? "",
      description: boundedText(input.description, 5000),
      base_price: input.base_price,
      category: input.category || null,
      image: validateImageToken(input.image, "\u{1F6CD}\u{FE0F}"),
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

  if (imageCheck.value) await replaceImages(db, product.id, imageCheck.value);

  await db.from("im_audit_logs").insert({
    actor_id: seller.user_id,
    actor_role: seller.role,
    action: "created_product",
    target: `product:${product.id}`,
  });
  revalidatePath("/seller/products");
  revalidatePath("/home");
  return { ok: true, productId: product.id };
}

export async function updateProduct(
  productId: number,
  input: Partial<ProductInput>
): Promise<ActionResult> {
  const seller = await requireSeller();
  if (!seller) return { ok: false, error: "Seller access required." };

  const imageCheck = validateImageDataUrls(input.images);
  if (!imageCheck.ok) return { ok: false, error: imageCheck.error };

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
  if (input.title !== undefined) patch.title = boundedText(input.title, 200) ?? "";
  if (input.description !== undefined) patch.description = boundedText(input.description, 5000);
  if (input.base_price !== undefined) patch.base_price = input.base_price;
  if (input.category !== undefined) patch.category = input.category || null;
  if (input.image !== undefined) {
    patch.image = validateImageToken(input.image, "\u{1F6CD}\u{FE0F}");
  }

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

  if (imageCheck.value) await replaceImages(db, productId, imageCheck.value);

  await db.from("im_audit_logs").insert({
    actor_id: seller.user_id,
    actor_role: seller.role,
    action: "updated_product",
    target: `product:${productId}`,
  });
  revalidatePath("/seller/products");
  revalidatePath("/home");
  return { ok: true, productId };
}

const ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "returned"] as const;
type OrderStatusValue = (typeof ORDER_STATUSES)[number];

const STATUS_MESSAGES: Partial<Record<OrderStatusValue, string>> = {
  processing: "Your seller is preparing your order.",
  shipped: "Your order is on its way.",
  delivered: "Your order has been delivered.",
  returned: "Your order was marked as returned.",
};

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
  await db.from("im_order_status_history").insert({
    order_id: orderId,
    status,
    created_by: seller.user_id,
  });
  await db.from("im_audit_logs").insert({
    actor_id: seller.user_id,
    actor_role: seller.role,
    action: `order_status_${status}`,
    target: `order:${orderId}`,
  });

  const { data: order } = await db.from("im_orders").select("buyer_id").eq("id", orderId).maybeSingle();
  if (order) {
    await createNotification({
      userId: order.buyer_id,
      type: "shipping_update",
      title: `Order #${orderId} is now ${status}`,
      body: STATUS_MESSAGES[status] || undefined,
      link: "/buyer/orders",
    });
  }

  revalidatePath("/seller/orders");
  revalidatePath("/buyer/orders");
  return { ok: true };
}

export async function createFlashSale(
  productId: number,
  discountPercent: number,
  durationHours: number
): Promise<ActionResult> {
  const seller = await requireSeller();
  if (!seller) return { ok: false, error: "Seller access required." };
  if (!(discountPercent > 0 && discountPercent <= 90))
    return { ok: false, error: "Discount must be between 1% and 90%." };
  const db = createAdminClient();

  const { data: product } = await db
    .from("im_products")
    .select("seller_id, title")
    .eq("id", productId)
    .maybeSingle();
  if (!product) return { ok: false, error: "Product not found." };
  if (seller.role !== "admin" && product.seller_id !== seller.user_id)
    return { ok: false, error: "You can only run flash sales on your own products." };

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + Math.max(1, durationHours) * 60 * 60 * 1000);
  const { error } = await db.from("im_flash_sales").insert({
    product_id: productId,
    discount_percent: discountPercent,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    created_by: seller.user_id,
  });
  if (error) return { ok: false, error: error.message };

  await db.from("im_audit_logs").insert({
    actor_id: seller.user_id,
    actor_role: seller.role,
    action: "started_flash_sale",
    target: `product:${productId}`,
  });

  const { data: wishlists } = await db
    .from("im_wishlists")
    .select("user_id")
    .eq("product_id", productId);
  for (const w of wishlists ?? []) {
    await createNotification({
      userId: w.user_id,
      type: "flash_sale",
      title: `Flash sale: ${product.title}`,
      body: `${discountPercent}% off for the next ${durationHours} hour${durationHours === 1 ? "" : "s"}.`,
      link: `/buyer/product/${productId}`,
    });
  }

  revalidatePath("/home");
  revalidatePath("/buyer/product", "layout");
  revalidatePath("/seller/products");
  return { ok: true, productId };
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

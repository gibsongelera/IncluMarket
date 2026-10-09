"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { createNotification, notifyAdmins } from "@/lib/notify";
import {
  boundedText,
  validateImageDataUrls,
  validateImageToken,
} from "@/lib/validation/data-url";

export interface ActionResult {
  ok: boolean;
  error?: string;
  productId?: number;
  /** True when an edit sent an approved listing back to review. */
  backToReview?: boolean;
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

/**
 * A SKU when the seller leaves it blank. SKUs are globally unique, so a seller
 * typing "SKU-1" used to collide with another seller's "SKU-1" and get a raw
 * database error. Product id plus a short random suffix cannot collide.
 */
function autoSku(productId: number, index: number): string {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `IM-${productId}-${index + 1}-${rand}`;
}

function cleanVariants(input: VariantInput[] | undefined) {
  return (input || [])
    .map((v) => ({
      id: v.id ? Number(v.id) : null,
      color_name: String(v.color_name || "").trim().slice(0, 60),
      size: String(v.size || "").trim().slice(0, 40) || null,
      stock_qty: Math.max(0, Math.min(100000, Math.floor(Number(v.stock_qty) || 0))),
      sku_code: String(v.sku_code || "").trim().slice(0, 60),
    }))
    .filter((v) => v.color_name);
}

function validPrice(n: unknown): number | null {
  const price = Number(n);
  return Number.isFinite(price) && price >= 0 && price <= 1_000_000 ? price : null;
}

async function requireSeller() {
  const session = await getSession();
  if (!session || (session.role !== "seller" && session.role !== "admin")) return null;
  return session;
}

export async function createProduct(input: ProductInput): Promise<ActionResult> {
  const seller = await requireSeller();
  if (!seller) return { ok: false, error: "Seller access required." };
  if (!input.title?.trim()) return { ok: false, error: "Please give your product a name." };
  const price = validPrice(input.base_price);
  if (price == null) return { ok: false, error: "Please enter a price of ₱0 or more." };

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
      base_price: price,
      category: input.category || null,
      image: validateImageToken(input.image, "\u{1F6CD}\u{FE0F}"),
      status: "pending",
    })
    .select("*")
    .single();
  if (error || !product) return { ok: false, error: "Could not create the product. Please try again." };

  // Every product has at least one variant, because stock lives on variants:
  // a product with none had no stock limit at all (B-05). A seller who adds no
  // options gets a "Standard" one with zero stock, to fill in before selling.
  const variants = cleanVariants(input.variants);
  if (!variants.length) variants.push({ id: null, color_name: "Standard", size: null, stock_qty: 0, sku_code: "" });
  const { error: vErr } = await db.from("im_product_variants").insert(
    variants.map((v, i) => ({
      product_id: product.id,
      color_name: v.color_name,
      size: v.size,
      stock_qty: v.stock_qty,
      sku_code: v.sku_code || autoSku(product.id, i),
    }))
  );
  if (vErr) {
    await db.from("im_products").delete().eq("id", product.id);
    return {
      ok: false,
      error: /duplicate|unique/i.test(vErr.message)
        ? "One of your SKU codes is already used. Leave SKU empty to have one made for you."
        : "Could not save the product options. Please try again.",
    };
  }

  if (imageCheck.value) await replaceImages(db, product.id, imageCheck.value);

  await db.from("im_audit_logs").insert({
    actor_id: seller.user_id,
    actor_role: seller.role,
    action: "created_product",
    target: `product:${product.id}`,
  });
  if (seller.role !== "admin") {
    await notifyAdmins({
      type: "system",
      title: `New listing to review: ${product.title}`,
      body: "A seller submitted a product. It stays hidden until it is approved.",
      link: "/admin/products",
    });
  }
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
    .select("seller_id, status, title")
    .eq("id", productId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Product not found." };
  if (seller.role !== "admin" && existing.seller_id !== seller.user_id)
    return { ok: false, error: "You can only edit your own products." };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = boundedText(input.title, 200) ?? "";
  if (input.description !== undefined) patch.description = boundedText(input.description, 5000);
  if (input.base_price !== undefined) {
    const price = validPrice(input.base_price);
    if (price == null) return { ok: false, error: "Please enter a price of ₱0 or more." };
    patch.base_price = price;
  }
  if (input.category !== undefined) patch.category = input.category || null;
  if (input.image !== undefined) {
    patch.image = validateImageToken(input.image, "\u{1F6CD}\u{FE0F}");
  }

  // Editing what buyers see — name, description, price, category, photos —
  // sends an approved listing back to review. It used to stay approved, so a
  // listing could be approved and then changed into anything (B-12). Stock
  // and option changes do not need review. Admin edits keep the status.
  const contentChanged =
    input.title !== undefined ||
    input.description !== undefined ||
    input.base_price !== undefined ||
    input.category !== undefined ||
    input.image !== undefined ||
    Boolean(imageCheck.value);
  const backToReview = seller.role !== "admin" && existing.status === "approved" && contentChanged;
  if (backToReview) patch.status = "pending";

  // Variants are checked BEFORE anything is written: an id must belong to
  // THIS product. updateProduct used to update any variant by id alone, so a
  // seller could rename or zero the stock of another seller's options (N-02).
  let incoming: ReturnType<typeof cleanVariants> | null = null;
  let existingIds: number[] = [];
  if (input.variants) {
    incoming = cleanVariants(input.variants);
    if (!incoming.length)
      return { ok: false, error: 'Keep at least one option, even if it is just "Standard".' };
    const { data: existingVariants } = await db
      .from("im_product_variants")
      .select("id")
      .eq("product_id", productId);
    existingIds = (existingVariants ?? []).map((v) => v.id as number);
    if (incoming.some((v) => v.id != null && !existingIds.includes(v.id)))
      return { ok: false, error: "One of those options does not belong to this product." };
  }

  const { error } = await db.from("im_products").update(patch).eq("id", productId);
  if (error) return { ok: false, error: "Could not save your changes. Please try again." };

  if (incoming) {
    const keepIds = incoming.filter((v) => v.id != null).map((v) => v.id as number);
    for (const id of existingIds) {
      if (!keepIds.includes(id)) {
        await db.from("im_product_variants").delete().eq("id", id).eq("product_id", productId);
      }
    }
    for (const [i, v] of incoming.entries()) {
      const payload = { color_name: v.color_name, size: v.size, stock_qty: v.stock_qty };
      if (v.id != null) {
        await db
          .from("im_product_variants")
          .update(v.sku_code ? { ...payload, sku_code: v.sku_code } : payload)
          .eq("id", v.id)
          .eq("product_id", productId);
      } else {
        await db.from("im_product_variants").insert({
          product_id: productId,
          ...payload,
          sku_code: v.sku_code || autoSku(productId, existingIds.length + i),
        });
      }
    }
  }

  if (imageCheck.value) await replaceImages(db, productId, imageCheck.value);

  if (backToReview) {
    await notifyAdmins({
      type: "system",
      title: `Edited listing needs review: ${existing.title}`,
      body: "An approved product was changed by its seller and is hidden until reviewed.",
      link: "/admin/products",
    });
  }

  await db.from("im_audit_logs").insert({
    actor_id: seller.user_id,
    actor_role: seller.role,
    action: backToReview ? "updated_product_resubmitted" : "updated_product",
    target: `product:${productId}`,
  });
  revalidatePath("/seller/products");
  revalidatePath("/home");
  revalidatePath(`/buyer/product/${productId}`);
  return { ok: true, productId, backToReview };
}

const ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "returned"] as const;
type OrderStatusValue = (typeof ORDER_STATUSES)[number];

/**
 * Allowed next steps. Until the database enforces the order state machine
 * (migration 0014), this is the gate: a seller could previously jump an order
 * from pending straight to delivered, or back again (B-10).
 */
const NEXT_STATUS: Partial<Record<OrderStatusValue, OrderStatusValue[]>> = {
  pending: ["processing"],
  processing: ["shipped"],
  shipped: ["delivered"],
  delivered: ["returned"],
};

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

  const { data: order } = await db
    .from("im_orders")
    .select("id, buyer_id, order_status, payment_status, payment_provider")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found." };

  // A seller may act only on an order made up entirely of their own lines.
  // One order can still hold several sellers' items until checkouts are split
  // per seller (migration 0015); until then such orders are admin-only rather
  // than any one seller changing everyone's parcel (B-09).
  if (seller.role !== "admin") {
    const { data: lines } = await db
      .from("im_order_items")
      .select("product_id")
      .eq("order_id", orderId);
    const productIds = [...new Set((lines ?? []).map((l) => l.product_id).filter(Boolean))] as number[];
    const { data: owners } = productIds.length
      ? await db.from("im_products").select("id, seller_id").in("id", productIds)
      : { data: [] as { id: number; seller_id: number }[] };
    const sellers = new Set((owners ?? []).map((p) => p.seller_id));
    if (!sellers.has(seller.user_id)) return { ok: false, error: "This order has none of your products." };
    if (sellers.size > 1)
      return {
        ok: false,
        error: "This order includes another seller's items, so an administrator will update it.",
      };
  }

  const allowed = NEXT_STATUS[order.order_status as OrderStatusValue] ?? [];
  if (!allowed.includes(status)) {
    return {
      ok: false,
      error: allowed.length
        ? `This order is ${order.order_status}; the next step is "${allowed.join('" or "')}".`
        : `This order is ${order.order_status} and cannot be changed.`,
    };
  }

  if (order.payment_provider === "paymongo" && order.payment_status !== "paid") {
    return { ok: false, error: "Wait until the buyer's online payment is complete before preparing this order." };
  }

  // Conditional on the status we just read, so two clicks (or two sellers'
  // tabs) cannot both advance the same order.
  const { data: moved, error } = await db
    .from("im_orders")
    .update({ order_status: status })
    .eq("id", orderId)
    .eq("order_status", order.order_status)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Could not update the order. Please try again." };
  if (!moved) return { ok: false, error: "This order was just updated. Please refresh." };

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

  await createNotification({
    userId: order.buyer_id,
    type: "shipping_update",
    title: `Order #${orderId} is now ${status}`,
    body: STATUS_MESSAGES[status] || undefined,
    link: "/buyer/orders",
  });

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

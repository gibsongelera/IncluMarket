"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { createNotification, emailIfWanted, notifyAdmins } from "@/lib/notify";
import { transitionOrder } from "@/lib/orders/transition";
import { isMissingObject } from "@/lib/db-errors";
import { rateLimit } from "@/lib/security/rate-limit";
import { storePublicImage } from "@/lib/media";
import { orderSellerIds } from "@/lib/orders/sellers";
import type { OrderState } from "@/lib/orders/state";
import {
  boundedText,
  validateImageDataUrls,
  isProductMediaUrl,
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
  /** PWD-friendly features (0016 adaptive_tags). */
  adaptiveTags?: string[];
}

const ADAPTIVE_TAG_KEYS = ["one_handed", "braille_large_print", "sensory_friendly", "seated_fit", "easy_grip", "easy_closure"];

function cleanTags(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  return [...new Set(input.map(String).filter((t) => ADAPTIVE_TAG_KEYS.includes(t)))];
}

/** Save the PWD-friendly features; nothing to do before migration 0016. */
async function saveTags(db: ReturnType<typeof createAdminClient>, productId: number, tags: string[] | undefined) {
  if (tags === undefined) return;
  const { error } = await db.from("im_products").update({ adaptive_tags: tags }).eq("id", productId);
  if (error && !isMissingObject(error)) console.error(`[seller] tags: ${error.message}`);
}

/**
 * Upload one product photo to Storage (ADR-4). The browser re-encodes every
 * photo through a canvas first (no EXIF or GPS); the server still checks the
 * bytes itself. Returns the public URL to put in the product's images.
 * Before migration 0019 (no bucket), returns the photo as an inline data URL —
 * the old storage — so sellers are never blocked.
 */
export async function uploadProductPhoto(form: FormData): Promise<ActionResult & { url?: string }> {
  const seller = await requireSeller();
  if (!seller || seller.role !== "seller") return { ok: false, error: "Seller access required." };
  const limited = await rateLimit("product_photo", `user:${seller.user_id}`, { limit: 60, windowSeconds: 3600 });
  if (!limited.ok) return { ok: false, error: "Too many uploads. Please wait a few minutes." };

  const stored = await storePublicImage(seller.user_id, form.get("photo"));
  return stored.ok ? { ok: true, url: stored.url } : { ok: false, error: stored.error };
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
  await saveTags(db, product.id, cleanTags(input.adaptiveTags));

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

  const { data: existingRow } = await db.from("im_products").select("*").eq("id", productId).maybeSingle();
  const existing = existingRow as {
    seller_id: number;
    status: string;
    title: string;
    description: string | null;
    base_price: number | string;
    category: string | null;
    image: string | null;
    adaptive_tags?: string[] | null;
  } | null;
  if (!existing) return { ok: false, error: "Product not found." };
  if (seller.role !== "admin" && existing.seller_id !== seller.user_id)
    return { ok: false, error: "You can only edit your own products." };
  const { data: currentImages } = await db
    .from("im_product_images")
    .select("url")
    .eq("product_id", productId)
    .order("position");
  const tags = cleanTags(input.adaptiveTags);

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

  // Editing what buyers see — name, description, price, category, photos,
  // PWD-friendly features — sends an approved listing back to review. It used
  // to stay approved, so a listing could be approved and then changed into
  // anything (B-12). Stock and option changes do not need review, and neither
  // does saving the form unchanged: values are compared, not just present.
  // Admin edits keep the status.
  const same = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");
  const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  // Rewriting identical photos would fire the 0016 image trigger and hide the
  // listing for review, so photos are only replaced when they differ.
  const imagesChanged =
    imageCheck.value !== undefined &&
    !sameList(imageCheck.value, ((currentImages ?? []) as { url: string }[]).map((i) => i.url));
  const contentChanged =
    ("title" in patch && !same(patch.title, existing.title)) ||
    ("description" in patch && !same(patch.description, existing.description)) ||
    ("base_price" in patch && Number(patch.base_price) !== Number(existing.base_price)) ||
    ("category" in patch && !same(patch.category, existing.category)) ||
    ("image" in patch && !same(patch.image, existing.image)) ||
    imagesChanged ||
    (tags !== undefined && !sameList([...tags].sort(), [...(existing.adaptive_tags ?? [])].sort()));
  const backToReview = seller.role !== "admin" && existing.status === "approved" && contentChanged;
  if (backToReview) patch.status = "pending";
  // An admin's edit is a moderation act: stamping moderated_at tells the
  // database's moderation trigger (0016) not to send it back to review.
  if (seller.role === "admin") patch.moderated_at = new Date().toISOString();

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

  // Tags go in the same UPDATE, so an admin edit stays one moderation act.
  if (tags !== undefined) patch.adaptive_tags = tags;
  let { error } = await db.from("im_products").update(patch).eq("id", productId);
  if (error && isMissingObject(error) && "adaptive_tags" in patch) {
    // Before migration 0016: no adaptive_tags column.
    delete patch.adaptive_tags;
    ({ error } = await db.from("im_products").update(patch).eq("id", productId));
  }
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

  if (imagesChanged && imageCheck.value) await replaceImages(db, productId, imageCheck.value);

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

const SELLER_TARGETS: OrderState[] = ["processing", "shipped", "delivered", "cancelled", "returned"];

const STATUS_MESSAGES: Partial<Record<OrderState, string>> = {
  processing: "Your seller is preparing your order.",
  shipped: "Your order is on its way.",
  delivered: "Your order has been delivered.",
  cancelled: "Your seller cancelled this order. Anything you paid will be refunded.",
  returned: "Your return was accepted.",
};

export interface StatusDetails {
  courier?: string;
  trackingNumber?: string;
  /** Required when cancelling or deciding a return. */
  reason?: string;
}

/**
 * Move one of the seller's orders to its next step.
 *
 * The rules live in the database (migration 0014, im_transition_order) and
 * are mirrored in lib/orders/state.ts; this action adds the ownership check.
 * A seller could previously jump an order from pending to delivered, mark
 * `returned` on their own, or prepare an unpaid online order (B-10).
 */
export async function updateOrderStatus(
  orderId: number,
  status: OrderState,
  details: StatusDetails = {}
): Promise<ActionResult> {
  const seller = await requireSeller();
  if (!seller) return { ok: false, error: "Seller access required." };
  if (!SELLER_TARGETS.includes(status)) return { ok: false, error: "Invalid status." };
  const db = createAdminClient();

  const { data: order } = await db
    .from("im_orders")
    .select("id, buyer_id, order_status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found." };

  // A seller may act only on an order made up entirely of their own lines.
  if (seller.role !== "admin") {
    const sellers = await orderSellerIds(db, orderId);
    if (!sellers.includes(seller.user_id)) return { ok: false, error: "This order has none of your products." };
    if (sellers.length > 1)
      return {
        ok: false,
        error: "This order includes another seller's items, so an administrator will update it.",
      };
  }

  const reason = boundedText(details.reason, 500);
  if (status === "shipped" && !boundedText(details.trackingNumber, 80)) {
    return { ok: false, error: "Please enter the courier tracking number so the buyer can follow the parcel." };
  }

  // Deciding a return: accept (returned) or reject (back to delivered).
  const to: OrderState = status;
  const result = await transitionOrder(db, {
    orderId,
    to,
    actorId: seller.user_id,
    actorRole: seller.role === "admin" ? "admin" : "seller",
    note: reason,
    meta: {
      courier: boundedText(details.courier, 80),
      tracking_number: boundedText(details.trackingNumber, 80),
      reason,
    },
  });
  if (!result.ok) return { ok: false, error: result.error };

  await db.from("im_audit_logs").insert({
    actor_id: seller.user_id,
    actor_role: seller.role,
    action: `order_status_${status}`,
    target: `order:${orderId}`,
  });

  const rejectedReturn = order.order_status === "return_requested" && status === "delivered";
  await createNotification({
    userId: order.buyer_id,
    type: "shipping_update",
    title: rejectedReturn ? `Return request for order #${orderId} was declined` : `Order #${orderId}: ${status.replace(/_/g, " ")}`,
    body: rejectedReturn
      ? reason || "The seller declined the return. You can contact support if you disagree."
      : status === "shipped" && details.trackingNumber
        ? `On its way${details.courier ? ` with ${details.courier}` : ""}. Tracking number: ${details.trackingNumber}.`
        : STATUS_MESSAGES[status] || undefined,
    link: `/buyer/orders`,
  });

  revalidatePath("/seller/orders");
  revalidatePath("/buyer/orders");
  return { ok: true };
}

/**
 * Start (or schedule) a flash sale on one of the seller's approved listings
 * (C-34, N-20): 1–90% off, 1 hour to 7 days, never overlapping another sale
 * on the same product. Migration 0024 enforces the same rules in the
 * database; these checks give the seller a plain answer first.
 */
export async function createFlashSale(
  productId: number,
  discountPercent: number,
  durationHours: number,
  startsAtIso?: string | null
): Promise<ActionResult> {
  const seller = await requireSeller();
  if (!seller) return { ok: false, error: "Seller access required." };
  const pct = Number(discountPercent);
  if (!(pct >= 1 && pct <= 90)) return { ok: false, error: "The discount is between 1% and 90%." };
  const hours = Math.floor(Number(durationHours));
  if (!(hours >= 1 && hours <= 168)) return { ok: false, error: "A flash sale runs from 1 hour to 7 days (168 hours)." };
  const db = createAdminClient();

  const { data: product } = await db
    .from("im_products")
    .select("seller_id, title, status")
    .eq("id", productId)
    .maybeSingle();
  if (!product) return { ok: false, error: "Product not found." };
  if (seller.role !== "admin" && product.seller_id !== seller.user_id)
    return { ok: false, error: "You can only run flash sales on your own products." };
  if (product.status !== "approved") return { ok: false, error: "Only a listing that is live in the shop can have a flash sale." };

  const now = Date.now();
  const requested = startsAtIso ? Date.parse(startsAtIso) : now;
  if (!Number.isFinite(requested)) return { ok: false, error: "Check the start time." };
  if (requested > now + 30 * 86_400_000) return { ok: false, error: "Schedule a sale at most 30 days ahead." };
  const startsAt = new Date(Math.max(now, requested));
  const endsAt = new Date(startsAt.getTime() + hours * 3_600_000);

  const { data: clash } = await db
    .from("im_flash_sales")
    .select("id")
    .eq("product_id", productId)
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString())
    .limit(1);
  if (clash?.length) return { ok: false, error: "This product already has a flash sale at that time. End it first, or pick another time." };

  const { error } = await db.from("im_flash_sales").insert({
    product_id: productId,
    discount_percent: pct,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    created_by: seller.user_id,
  });
  if (error) {
    if (/already has a flash sale/i.test(error.message)) return { ok: false, error: "This product already has a flash sale at that time." };
    if (/at most 7 days|approved listing/i.test(error.message)) return { ok: false, error: error.message + "." };
    return { ok: false, error: "Could not start the flash sale. Please try again." };
  }
  const scheduled = startsAt.getTime() > now + 60_000;
  if (scheduled) {
    await db.from("im_audit_logs").insert({
      actor_id: seller.user_id,
      actor_role: seller.role,
      action: "scheduled_flash_sale",
      target: `product:${productId} at:${startsAt.toISOString()}`,
    });
    revalidatePath("/seller/flash-sales");
    return { ok: true, productId };
  }

  await db.from("im_audit_logs").insert({
    actor_id: seller.user_id,
    actor_role: seller.role,
    action: "started_flash_sale",
    target: `product:${productId}`,
  });

  // Tell everyone who saved it — in the app and by email, each only if
  // they have not turned flash-sale notices off (C-24).
  const { data: wishlists } = await db
    .from("im_wishlists")
    .select("user_id")
    .eq("product_id", productId);
  const savers = (wishlists ?? []).map((w) => w.user_id);
  const { data: people } = savers.length
    ? await db.from("im_profiles").select("id, name, email").in("id", savers)
    : { data: [] as { id: number; name: string; email: string }[] };
  for (const person of people ?? []) {
    await createNotification({
      userId: person.id,
      type: "flash_sale",
      title: `Flash sale: ${product.title}`,
      body: `${pct}% off for the next ${hours} hour${hours === 1 ? "" : "s"}.`,
      link: `/buyer/product/${productId}`,
    });
    if (person.email) {
      await emailIfWanted(person.id, "flash_sale", "flash_sale", { email: person.email, name: person.name }, {
        productId,
        productTitle: product.title,
        percent: pct,
        hours,
      });
    }
  }

  revalidatePath("/home");
  revalidatePath("/buyer/product", "layout");
  revalidatePath("/seller/products");
  revalidatePath("/seller/flash-sales");
  return { ok: true, productId };
}

/** End a running sale now, or cancel a scheduled one (C-34). */
export async function endFlashSale(saleId: number): Promise<ActionResult> {
  const seller = await requireSeller();
  if (!seller) return { ok: false, error: "Seller access required." };
  const db = createAdminClient();
  const { data: sale } = await db.from("im_flash_sales").select("id, product_id, starts_at, ends_at").eq("id", Number(saleId)).maybeSingle();
  if (!sale) return { ok: false, error: "That sale no longer exists." };
  const { data: product } = await db.from("im_products").select("seller_id").eq("id", sale.product_id).maybeSingle();
  if (!product || (seller.role !== "admin" && product.seller_id !== seller.user_id)) {
    return { ok: false, error: "You can only end sales on your own products." };
  }
  const now = new Date();
  if (Date.parse(sale.ends_at) <= now.getTime()) return { ok: false, error: "That sale has already ended." };
  const { error } =
    Date.parse(sale.starts_at) > now.getTime()
      ? await db.from("im_flash_sales").delete().eq("id", sale.id)
      : await db.from("im_flash_sales").update({ ends_at: now.toISOString() }).eq("id", sale.id);
  if (error) return { ok: false, error: "Could not end the sale. Please try again." };
  await db.from("im_audit_logs").insert({
    actor_id: seller.user_id,
    actor_role: seller.role,
    action: "ended_flash_sale",
    target: `flash_sale:${sale.id} product:${sale.product_id}`,
  });
  revalidatePath("/home");
  revalidatePath("/buyer/product", "layout");
  revalidatePath("/seller/flash-sales");
  return { ok: true };
}

/**
 * Unpublish or republish a listing.
 *
 * This replaces deleting. A hard delete set every order line's product to
 * NULL and erased the product's reviews, so buyers' order history lost what
 * they bought (N-19). An unpublished listing is `archived` (migration 0016):
 * hidden from the shop, still named in old orders. Republishing sends it
 * back to review, because it may have changed while hidden.
 */
export async function setProductPublished(productId: number, published: boolean): Promise<ActionResult> {
  const seller = await requireSeller();
  if (!seller) return { ok: false, error: "Seller access required." };
  const db = createAdminClient();
  const { data: existing } = await db
    .from("im_products")
    .select("seller_id, status, title")
    .eq("id", productId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Product not found." };
  if (seller.role !== "admin" && existing.seller_id !== seller.user_id)
    return { ok: false, error: "You can only change your own products." };

  if (!published && existing.status === "archived") return { ok: true };
  if (published && existing.status !== "archived") return { ok: false, error: "This listing is already published." };

  const { error } = await db
    .from("im_products")
    .update({ status: published ? "pending" : "archived", updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) {
    return {
      ok: false,
      error: /check constraint|archived/i.test(error.message)
        ? "Unpublishing needs the latest database update. Please try again later."
        : "Could not update the listing. Please try again.",
    };
  }
  await db.from("im_audit_logs").insert({
    actor_id: seller.user_id,
    actor_role: seller.role,
    action: published ? "republished_product" : "unpublished_product",
    target: `product:${productId}`,
  });
  if (published && seller.role !== "admin") {
    await notifyAdmins({
      type: "system",
      title: `Listing to review again: ${existing.title}`,
      body: "A seller republished a listing they had taken down.",
      link: "/admin/products",
    });
  }
  revalidatePath("/seller/products");
  revalidatePath("/home");
  revalidatePath(`/buyer/product/${productId}`);
  return { ok: true };
}

/**
 * Reply publicly to a review of one of this seller's products (C-18). An
 * empty reply removes it. The buyer is notified. Before migration 0019 there
 * is nowhere to store a reply, and the seller is told so.
 */
export async function replyToReview(reviewId: number, text: string): Promise<ActionResult> {
  const seller = await requireSeller();
  if (!seller) return { ok: false, error: "Seller access required." };
  const reply = boundedText(text ?? "", 1000);
  if (reply && reply.length < 2) return { ok: false, error: "Write a short reply, or leave it empty to remove it." };

  const db = createAdminClient();
  const { data: review } = await db
    .from("im_product_reviews")
    .select("id, product_id, buyer_id")
    .eq("id", reviewId)
    .maybeSingle();
  if (!review) return { ok: false, error: "That review no longer exists." };
  const { data: product } = await db
    .from("im_products")
    .select("seller_id, title")
    .eq("id", review.product_id)
    .maybeSingle();
  if (!product || product.seller_id !== seller.user_id) return { ok: false, error: "You can reply only to reviews of your own products." };

  const { error } = await db
    .from("im_product_reviews")
    .update({ seller_reply: reply || null, seller_reply_at: reply ? new Date().toISOString() : null })
    .eq("id", reviewId);
  if (error) {
    if (isMissingObject(error)) return { ok: false, error: "Replies need database migration 0019." };
    return { ok: false, error: "Could not save your reply. Please try again." };
  }

  await db.from("im_audit_logs").insert({
    actor_id: seller.user_id,
    actor_role: "seller",
    action: reply ? "replied_to_review" : "removed_review_reply",
    target: `review:${reviewId}`,
  });
  if (reply) {
    await createNotification({
      userId: review.buyer_id,
      type: "review_reply",
      title: "The seller replied to your review",
      body: `On “${product.title}”.`,
      link: `/buyer/product/${review.product_id}#reviews-title`,
    });
  }
  revalidatePath("/seller/reviews");
  revalidatePath(`/buyer/product/${review.product_id}`);
  return { ok: true };
}

/**
 * Seller Centre → Shop settings (C-36): the public shop's name, story and
 * city. Before migration 0019 only the story can be saved.
 */
export async function updateShopSettings(input: {
  shopName: string;
  story: string;
  city: string;
}): Promise<ActionResult & { field?: string }> {
  const seller = await requireSeller();
  if (!seller || seller.role !== "seller") return { ok: false, error: "Seller access required." };
  const shopName = String(input?.shopName ?? "").replace(/\s+/g, " ").trim();
  if (shopName && (shopName.length < 2 || shopName.length > 80)) {
    return { ok: false, field: "shopName", error: "A shop name is 2 to 80 characters, or leave it empty to use your name." };
  }
  const story = boundedText(input?.story ?? "", 1000);
  const city = String(input?.city ?? "").replace(/\s+/g, " ").trim().slice(0, 80);

  const db = createAdminClient();
  const now = new Date().toISOString();
  let { error } = await db
    .from("im_profiles")
    .update({ shop_name: shopName || null, seller_story: story || null, pickup_city: city || null, updated_at: now })
    .eq("id", seller.user_id);
  if (error && isMissingObject(error)) {
    ({ error } = await db.from("im_profiles").update({ seller_story: story || null, updated_at: now }).eq("id", seller.user_id));
  }
  if (error) return { ok: false, error: "Could not save your shop settings. Please try again." };
  await db.from("im_audit_logs").insert({
    actor_id: seller.user_id,
    actor_role: "seller",
    action: "updated_shop",
    target: `profile:${seller.user_id}`,
  });
  revalidatePath("/seller/shop");
  revalidatePath(`/shop/${seller.user_id}`);
  revalidatePath("/seller/dashboard");
  return { ok: true };
}

/**
 * Duplicate one of the seller's listings (C-32): same details, photos,
 * options and PWD-friendly features, as a new listing waiting for review.
 * Options start at 0 stock with new SKUs, so nothing is sold twice by
 * accident.
 */
export async function duplicateProduct(productId: number): Promise<ActionResult> {
  const seller = await requireSeller();
  if (!seller || seller.role !== "seller") return { ok: false, error: "Seller access required." };
  const db = createAdminClient();
  const { data: src } = await db.from("im_products").select("*").eq("id", Number(productId)).maybeSingle();
  if (!src || src.seller_id !== seller.user_id) return { ok: false, error: "You can only duplicate your own products." };

  const { data: copy, error } = await db
    .from("im_products")
    .insert({
      seller_id: seller.user_id,
      title: `${String(src.title).slice(0, 190)} (copy)`,
      description: src.description,
      base_price: src.base_price,
      category: src.category,
      image: src.image,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !copy) return { ok: false, error: "Could not duplicate the product. Please try again." };

  const [{ data: variants }, { data: images }] = await Promise.all([
    db.from("im_product_variants").select("color_name, size").eq("product_id", src.id),
    db.from("im_product_images").select("url, position").eq("product_id", src.id).order("position"),
  ]);
  const opts = (variants ?? []) as { color_name: string; size: string | null }[];
  await db.from("im_product_variants").insert(
    (opts.length ? opts : [{ color_name: "Standard", size: null }]).map((v, i) => ({
      product_id: copy.id,
      color_name: v.color_name,
      size: v.size,
      stock_qty: 0,
      sku_code: autoSku(copy.id, i),
    }))
  );
  if (images?.length) await replaceImages(db, copy.id, (images as { url: string }[]).map((i) => i.url));
  await saveTags(db, copy.id, Array.isArray(src.adaptive_tags) ? src.adaptive_tags : undefined);

  await db.from("im_audit_logs").insert({
    actor_id: seller.user_id,
    actor_role: "seller",
    action: "duplicated_product",
    target: `product:${src.id} -> product:${copy.id}`,
  });
  revalidatePath("/seller/products");
  return { ok: true, productId: copy.id };
}

/**
 * Shop logo or banner (C-36): a photo already uploaded with
 * uploadProductPhoto (Storage, product-media bucket), or null to remove it.
 */
export async function setShopImage(kind: "logo" | "banner", url: string | null): Promise<ActionResult> {
  const seller = await requireSeller();
  if (!seller || seller.role !== "seller") return { ok: false, error: "Seller access required." };
  if (kind !== "logo" && kind !== "banner") return { ok: false, error: "Unknown image." };
  if (url !== null && !isProductMediaUrl(String(url))) {
    return { ok: false, error: "Shop images need the latest database update (photo storage)." };
  }
  const column = kind === "logo" ? "shop_logo_url" : "shop_banner_url";
  const { error } = await createAdminClient()
    .from("im_profiles")
    .update({ [column]: url, updated_at: new Date().toISOString() })
    .eq("id", seller.user_id);
  if (error) {
    if (isMissingObject(error)) return { ok: false, error: "Shop images need database migration 0019." };
    return { ok: false, error: "Could not save the image. Please try again." };
  }
  revalidatePath("/seller/shop");
  revalidatePath(`/shop/${seller.user_id}`);
  return { ok: true };
}

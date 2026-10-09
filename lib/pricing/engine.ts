import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  priceLines,
  variantLabel,
  type Catalog,
  type LineInput,
  type PricedCart,
  type PricingProduct,
  type PricingSale,
  type PricingVariant,
  type PwdContext,
} from "./core";
import { MAX_LINE_QUANTITY, SHIPPING_FEE } from "./constants";
import { loadPwdContext } from "./pwd";
import { sellersWhoCanSell } from "@/lib/catalog";

/**
 * Pricing engine — loads what lib/pricing/core.ts needs and runs it.
 *
 * Used by the cart page, the checkout page, placeOrder and the PayMongo line
 * items, so all four agree on every centavo. Nothing here trusts a price,
 * stock figure or variant id from the browser: everything is re-read.
 */

type Db = ReturnType<typeof createAdminClient>;

export class PricingUnavailableError extends Error {
  constructor(what: string) {
    super(`Could not load ${what} for pricing.`);
    this.name = "PricingUnavailableError";
  }
}

function check<T>(what: string, res: { data: unknown; error: { message: string } | null }): T[] {
  if (res.error) {
    console.error(`[pricing] ${what}: ${res.error.message}`);
    throw new PricingUnavailableError(what);
  }
  return (res.data as T[] | null) ?? [];
}

/** Everything priceLines() needs for these products, read fresh. */
export async function loadCatalog(db: Db, productIds: number[]): Promise<Catalog> {
  const ids = [...new Set(productIds.filter((n) => Number.isInteger(n) && n > 0))];
  const catalog: Catalog = { products: new Map(), variants: new Map(), sales: new Map() };
  if (!ids.length) return catalog;

  const nowIso = new Date().toISOString();
  const [products, variants, images, sales] = await Promise.all([
    db.from("im_products").select("id, seller_id, title, base_price, category, status, image").in("id", ids),
    db.from("im_product_variants").select("id, product_id, color_name, size, stock_qty").in("product_id", ids),
    db.from("im_product_images").select("product_id, url, position").in("product_id", ids).order("position"),
    db
      .from("im_flash_sales")
      .select("id, product_id, discount_percent, starts_at")
      .in("product_id", ids)
      .lte("starts_at", nowIso)
      .gte("ends_at", nowIso)
      .order("starts_at", { ascending: false }),
  ]);

  const productRows = check<{
    id: number; seller_id: number; title: string; base_price: number; category: string | null; status: string; image: string | null;
  }>("products", products);
  let activeSeller: Set<number>;
  try {
    activeSeller = await sellersWhoCanSell(db, productRows.map((p) => p.seller_id));
  } catch (e) {
    console.error("[pricing] sellers:", (e as Error).message);
    throw new PricingUnavailableError("sellers");
  }

  const firstImage = new Map<number, string>();
  for (const img of check<{ product_id: number; url: string }>("images", images)) {
    if (!firstImage.has(img.product_id)) firstImage.set(img.product_id, img.url);
  }

  for (const p of productRows) {
    const product: PricingProduct = {
      id: p.id,
      sellerId: p.seller_id,
      title: p.title,
      basePrice: Number(p.base_price),
      categoryId: p.category,
      isPublic: p.status === "approved" && activeSeller.has(p.seller_id),
      image: firstImage.get(p.id) ?? null,
    };
    catalog.products.set(p.id, product);
  }

  for (const v of check<{ id: number; product_id: number; color_name: string; size: string | null; stock_qty: number }>(
    "variants",
    variants
  )) {
    const variant: PricingVariant = {
      id: v.id,
      productId: v.product_id,
      label: variantLabel(v.color_name, v.size),
      stock: Number(v.stock_qty) || 0,
    };
    catalog.variants.set(v.id, variant);
  }

  // Newest sale wins if two windows overlap (createFlashSale prevents that
  // from S6 on, but rows from before then may exist).
  for (const s of check<{ id: number; product_id: number; discount_percent: number }>("sales", sales)) {
    if (catalog.sales.has(s.product_id)) continue;
    const sale: PricingSale = { id: s.id, productId: s.product_id, discountPercent: Number(s.discount_percent) };
    catalog.sales.set(s.product_id, sale);
  }

  return catalog;
}

/** Price arbitrary lines for a buyer (or a guest when buyerId is null). */
export async function priceInputs(
  db: Db,
  inputs: LineInput[],
  buyerId: number | null
): Promise<PricedCart> {
  const [catalog, pwd] = await Promise.all([
    loadCatalog(db, inputs.map((i) => i.productId)),
    buyerId ? loadPwdContext(db, buyerId) : Promise.resolve<PwdContext | null>(null),
  ]);
  return priceLines(inputs, catalog, {
    shippingPerSeller: SHIPPING_FEE,
    maxQuantity: MAX_LINE_QUANTITY,
    pwd,
  });
}

/**
 * The buyer's cart, priced. `onlyItemIds` restricts it to the selected lines
 * (Shopee-style "check out selected").
 */
export async function priceCartForBuyer(
  buyerId: number,
  onlyItemIds?: number[] | null
): Promise<PricedCart> {
  const db = createAdminClient();
  let q = db
    .from("im_cart_items")
    .select("id, product_id, variant_id, quantity")
    .eq("user_id", buyerId)
    .order("created_at", { ascending: true });
  if (onlyItemIds && onlyItemIds.length) q = q.in("id", onlyItemIds);
  const rows = check<{ id: number; product_id: number; variant_id: number | null; quantity: number }>(
    "cart",
    await q
  );
  return priceInputs(
    db,
    rows.map((r) => ({
      cartItemId: r.id,
      productId: r.product_id,
      variantId: r.variant_id,
      quantity: r.quantity,
    })),
    buyerId
  );
}

/**
 * Seed realistic demo products for the 3 demo seller accounts so the
 * storefront (wishlist, sorting, featured/recommended rails, reviews,
 * featured-sellers section) has real content to render.
 *
 * Usage (from repo root, with .env.local loaded, AFTER migrations + provision-users):
 *   node --env-file=.env.local scripts/provision-users.mjs
 *   node --env-file=.env.local scripts/seed-demo-products.mjs
 *
 * Idempotent: deletes and re-inserts products scoped to the 3 demo seller
 * emails only — never touches products created by real sellers.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SELLER_EMAILS = ["seller@gmail.com", "seller2@gmail.com", "seller3@gmail.com"];

// One demo buyer review per product keeps rating aggregates non-empty.
const BUYER_EMAIL = "buyer@gmail.com";

const PRODUCTS = [
  // ---- seller@gmail.com --------------------------------------------------
  {
    seller: "seller@gmail.com",
    title: "Rattan Market Tote — Handwoven",
    description:
      "A sturdy everyday tote handwoven from sustainably harvested rattan, finished with a canvas-lined " +
      "interior pocket. Woven seated, one strip at a time, on a low frame loom.",
    category: "bags",
    image: "\u{1F45C}",
    base_price: 899,
    featured: true,
    variants: [
      { color_name: "Natural", size: "Standard", stock_qty: 18, sku_code: "BAG-RTN-NAT" },
      { color_name: "Charcoal Dye", size: "Standard", stock_qty: 9, sku_code: "BAG-RTN-CHR" },
    ],
    review: { rating: 5, comment: "Beautifully made and the strap is so comfortable. Fast shipping too!" },
  },
  {
    seller: "seller@gmail.com",
    title: "Crossbody Sling with Magnetic Clasp",
    description:
      "A one-handed-friendly crossbody bag with a magnetic snap closure instead of a buckle — quick to open " +
      "and close for anyone with limited grip strength.",
    category: "bags",
    image: "\u{1F392}",
    base_price: 650,
    variants: [{ color_name: "Terracotta", size: "Standard", stock_qty: 14, sku_code: "BAG-SLG-TER" }],
    review: { rating: 4, comment: "Love the magnetic clasp, so much easier than a zipper." },
  },
  {
    seller: "seller@gmail.com",
    title: "Banana-Fiber Coin Pouch (Set of 2)",
    description: "Two small zip pouches woven from banana fiber (abaca), perfect for coins, earbuds, or meds.",
    category: "accessories",
    image: "\u{1F45B}",
    base_price: 250,
    variants: [{ color_name: "Mixed Natural", size: "One Size", stock_qty: 30, sku_code: "ACC-POUCH-MIX" }],
  },
  {
    seller: "seller@gmail.com",
    title: "Sensory-Friendly Weighted Lap Pad",
    description:
      "A 1.5kg weighted lap pad with a brushed-cotton cover, hand-sewn in small batches. Helps with focus " +
      "and grounding during long work or study sessions.",
    category: "wellness",
    image: "\u{1F9F8}",
    base_price: 780,
    featured: true,
    variants: [{ color_name: "Sky Blue", size: "Lap (40x30cm)", stock_qty: 11, sku_code: "WEL-LAP-BLU" }],
    review: { rating: 5, comment: "This has genuinely helped my son focus on homework. Worth every peso." },
  },

  // ---- seller2@gmail.com (Maria Santos) ----------------------------------
  {
    seller: "seller2@gmail.com",
    title: "Foot-Loom Table Runner",
    description:
      "Handwoven on a foot-pedal loom adapted for limited hand mobility — every runner has slightly unique " +
      "color banding because it's genuinely one-of-a-kind, not printed.",
    category: "crafts",
    image: "\u{1F9F5}",
    base_price: 540,
    featured: true,
    variants: [
      { color_name: "Sunset Stripe", size: "150x35cm", stock_qty: 7, sku_code: "CRF-RUN-SUN" },
      { color_name: "Ocean Stripe", size: "150x35cm", stock_qty: 5, sku_code: "CRF-RUN-OCN" },
    ],
    review: { rating: 5, comment: "The colors are even richer in person. Bought a second one as a gift." },
  },
  {
    seller: "seller2@gmail.com",
    title: "Handwoven Placemats (Set of 4)",
    description: "Four matching placemats from the same loom run as the table runner — durable, washable cotton weave.",
    category: "crafts",
    image: "\u{1FA75}",
    base_price: 620,
    variants: [{ color_name: "Ocean Stripe", size: "Set of 4", stock_qty: 10, sku_code: "CRF-MAT-OCN4" }],
  },
  {
    seller: "seller2@gmail.com",
    title: "Adaptive Cushion Cover — Easy-Grip Zip",
    description:
      "A throw-pillow cover with an oversized zip pull that's easy to grip with limited dexterity, made from " +
      "the same woven textile line.",
    category: "crafts",
    image: "\u{1F6CB}\u{FE0F}",
    base_price: 380,
    variants: [{ color_name: "Sunset Stripe", size: "45x45cm", stock_qty: 16, sku_code: "CRF-CUSH-SUN" }],
  },
  {
    seller: "seller2@gmail.com",
    title: "Loomed Laptop Sleeve, 13\"",
    description: "Padded 13-inch laptop sleeve with a handwoven outer shell and water-resistant lining.",
    category: "accessories",
    image: "\u{1F4BB}",
    base_price: 720,
    variants: [{ color_name: "Charcoal Weave", size: "13-inch", stock_qty: 8, sku_code: "ACC-SLV-CHR13" }],
    review: { rating: 4, comment: "Snug fit for my 13-inch laptop and the padding is solid." },
  },

  // ---- seller3@gmail.com (Juno Reyes) ------------------------------------
  {
    seller: "seller3@gmail.com",
    title: "Adaptive Button-Down — Magnetic Placket",
    description:
      "A tailored button-down shirt where every button is replaced with a hidden magnetic placket — the look " +
      "of buttons, none of the fine-motor struggle. Seated-fit cut.",
    category: "apparel",
    image: "\u{1F455}",
    base_price: 1150,
    featured: true,
    variants: [
      { color_name: "White", size: "M", stock_qty: 12, sku_code: "APP-SHRT-WHT-M" },
      { color_name: "Sky Blue", size: "L", stock_qty: 9, sku_code: "APP-SHRT-SKY-L" },
    ],
    review: { rating: 5, comment: "First dress shirt I've put on by myself in years. Life-changing." },
  },
  {
    seller: "seller3@gmail.com",
    title: "One-Handed Zip Hoodie",
    description: "A pull-cord zipper extension makes this hoodie easy to zip one-handed, without sacrificing fit.",
    category: "apparel",
    image: "\u{1F9E5}",
    base_price: 980,
    variants: [{ color_name: "Charcoal", size: "L", stock_qty: 15, sku_code: "APP-HOOD-CHR-L" }],
  },
  {
    seller: "seller3@gmail.com",
    title: "Seated-Fit Trousers, Adjustable Waist",
    description:
      "Cut higher in the back and lower in the front for a cleaner seated silhouette, with a hook-and-loop " +
      "adjustable waistband instead of a belt.",
    category: "apparel",
    image: "\u{1F456}",
    base_price: 1050,
    variants: [{ color_name: "Navy", size: "32", stock_qty: 10, sku_code: "APP-TRSR-NVY-32" }],
    review: { rating: 4, comment: "So much more comfortable for long days in my chair." },
  },
  {
    seller: "seller3@gmail.com",
    title: "Deaf-Owned Studio Tote Bag",
    description: "A canvas tote screen-printed in-studio with original line art. Every order is confirmed via in-app messaging only.",
    category: "bags",
    image: "\u{1F6CD}\u{FE0F}",
    base_price: 420,
    variants: [{ color_name: "Natural Canvas", size: "Standard", stock_qty: 20, sku_code: "BAG-TOTE-CAN" }],
  },
  {
    seller: "seller3@gmail.com",
    title: "Custom Tailoring Consultation (30 min)",
    description:
      "A 30-minute adaptive-clothing fitting consultation, conducted over in-app chat or captioned video call — " +
      "no phone call required.",
    category: "services",
    image: "\u{2702}\u{FE0F}",
    base_price: 300,
    variants: [{ color_name: "Standard", size: "30 min", stock_qty: 99, sku_code: "SVC-CONSULT-30" }],
  },
  {
    seller: "seller3@gmail.com",
    title: "Adaptive Pouch Bag — Wide Mouth Snap",
    description: "A wide-mouth accessory pouch with an oversized snap tab, easy to open and close one-handed.",
    category: "accessories",
    image: "\u{1F45B}",
    base_price: 310,
    variants: [{ color_name: "Mustard", size: "One Size", stock_qty: 22, sku_code: "ACC-PCH-MUS" }],
  },
];

async function getProfileIdByEmail(email) {
  const { data, error } = await db.from("im_profiles").select("id").ilike("email", email).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No im_profiles row for ${email} — run provision-users.mjs first.`);
  return data.id;
}

async function wipeExistingDemoProducts(sellerIds) {
  const { data: existing, error } = await db.from("im_products").select("id").in("seller_id", sellerIds);
  if (error) throw error;
  const ids = (existing || []).map((p) => p.id);
  if (!ids.length) return;
  await db.from("im_flash_sales").delete().in("product_id", ids);
  await db.from("im_wishlists").delete().in("product_id", ids);
  await db.from("im_product_reviews").delete().in("product_id", ids);
  await db.from("im_product_variants").delete().in("product_id", ids);
  await db.from("im_product_images").delete().in("product_id", ids);
  await db.from("im_products").delete().in("id", ids);
  console.log(`  wiped ${ids.length} previous demo product(s)`);
}

async function main() {
  const sellerIdByEmail = {};
  for (const email of SELLER_EMAILS) sellerIdByEmail[email] = await getProfileIdByEmail(email);
  const buyerId = await getProfileIdByEmail(BUYER_EMAIL);

  console.log("Wiping previous demo products...");
  await wipeExistingDemoProducts(Object.values(sellerIdByEmail));

  console.log(`Inserting ${PRODUCTS.length} demo products...`);
  let firstFeaturedId = null;

  for (const p of PRODUCTS) {
    const sellerId = sellerIdByEmail[p.seller];
    const { data: product, error } = await db
      .from("im_products")
      .insert({
        seller_id: sellerId,
        title: p.title,
        description: p.description,
        base_price: p.base_price,
        category: p.category,
        image: p.image,
        status: "approved",
        is_featured: Boolean(p.featured),
      })
      .select("id")
      .single();
    if (error) throw error;
    if (p.featured && !firstFeaturedId) firstFeaturedId = product.id;

    const { error: vErr } = await db.from("im_product_variants").insert(
      p.variants.map((v) => ({
        product_id: product.id,
        color_name: v.color_name,
        size: v.size,
        stock_qty: v.stock_qty,
        sku_code: v.sku_code,
      }))
    );
    if (vErr) throw vErr;

    if (p.review) {
      const { error: rErr } = await db.from("im_product_reviews").insert({
        product_id: product.id,
        buyer_id: buyerId,
        rating_score: p.review.rating,
        comment_text: p.review.comment,
      });
      if (rErr) throw rErr;
    }

    console.log(`  + ${p.title} (product:${product.id})`);
  }

  if (firstFeaturedId) {
    const startsAt = new Date();
    const endsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const { error: fErr } = await db.from("im_flash_sales").insert({
      product_id: firstFeaturedId,
      discount_percent: 20,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      created_by: sellerIdByEmail["seller@gmail.com"],
    });
    if (fErr) throw fErr;
    console.log(`  flash sale: product:${firstFeaturedId} (20% off, 3 days)`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

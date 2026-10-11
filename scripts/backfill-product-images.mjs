#!/usr/bin/env node
/**
 * backfill-product-images — move old product photos out of Postgres (ADR-4).
 *
 * Product photos used to be stored as base64 data URLs in
 * im_product_images.url. New ones go to the public `product-media` bucket.
 * This one-off script moves the old ones: for each data URL it uploads the
 * bytes to product-media/<seller_id>/<uuid>.<ext> and swaps the row's URL
 * through im_move_product_image_to_storage() (migration 0023), which does not
 * send approved listings back to review.
 *
 * Requires migrations 0019 (bucket) and 0023 (function).
 *
 *   node --env-file=.env.local scripts/backfill-product-images.mjs          # dry run: counts only
 *   BACKFILL_CONFIRM=<project-ref> node --env-file=.env.local \
 *     scripts/backfill-product-images.mjs --apply [--limit 50]              # does it
 *
 * <project-ref> is the subdomain of NEXT_PUBLIC_SUPABASE_URL — typing it is
 * the guard against running this against the wrong project. Run it on a dev
 * project first. It is safe to re-run: moved rows are skipped.
 *
 * Exits by setting process.exitCode, never process.exit(): on Windows,
 * exiting while fetch's sockets are still closing aborts Node with
 * "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)".
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const DATA_RE = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/;

async function main() {
  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_ || !KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    return 1;
  }
  const ref = new URL(URL_).hostname.split(".")[0];
  const apply = process.argv.includes("--apply");
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Math.max(1, Number(process.argv[limitArg + 1]) || 50) : 1000;

  if (apply && process.env.BACKFILL_CONFIRM !== ref) {
    console.error(`Refusing to write: set BACKFILL_CONFIRM=${ref} to confirm the target project.`);
    return 1;
  }

  const db = createClient(URL_, KEY, { auth: { persistSession: false } });

  const { data: rows, error } = await db
    .from("im_product_images")
    .select("id, product_id, url")
    .like("url", "data:%")
    .order("id")
    .limit(limit);
  if (error) {
    console.error(`Could not read im_product_images: ${error.message}`);
    return 1;
  }

  console.log(`backfill-product-images — project ${ref}${apply ? "" : " (dry run)"}`);
  console.log(`  ${rows.length} photo(s) stored as data URLs${rows.length === limit ? " (limit reached; run again)" : ""}`);
  if (!apply || !rows.length) return 0;

  const productIds = [...new Set(rows.map((r) => r.product_id))];
  const { data: products } = await db.from("im_products").select("id, seller_id").in("id", productIds);
  const sellerOf = new Map((products ?? []).map((p) => [p.id, p.seller_id]));

  let moved = 0;
  let skipped = 0;
  for (const row of rows) {
    const m = String(row.url).match(DATA_RE);
    const seller = sellerOf.get(row.product_id);
    if (!m || !seller) {
      skipped++;
      console.log(`  skip image ${row.id}: ${!m ? "not a JPEG/PNG data URL" : "product has no seller"}`);
      continue;
    }
    const type = m[1];
    const ext = type === "image/png" ? "png" : "jpg";
    const path = `${seller}/${randomUUID()}.${ext}`;
    const bytes = Buffer.from(m[2], "base64");
    const up = await db.storage.from("product-media").upload(path, bytes, { contentType: type, upsert: false });
    if (up.error) {
      skipped++;
      console.log(`  skip image ${row.id}: upload failed (${up.error.message})`);
      continue;
    }
    const publicUrl = db.storage.from("product-media").getPublicUrl(path).data.publicUrl;
    const swap = await db.rpc("im_move_product_image_to_storage", { p_image_id: row.id, p_url: publicUrl });
    if (swap.error || swap.data !== true) {
      await db.storage.from("product-media").remove([path]);
      skipped++;
      console.log(`  skip image ${row.id}: ${swap.error ? swap.error.message : "already moved"}`);
      continue;
    }
    moved++;
  }
  console.log(`  moved ${moved}, skipped ${skipped}`);
  return skipped ? 1 : 0;
}

process.exitCode = await main().catch((err) => {
  console.error(err);
  return 1;
});

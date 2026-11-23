import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIdImage } from "@/lib/pwd/image-check";

/**
 * Store one public image (product photo, shop logo or banner, homepage
 * banner) in the product-media bucket (ADR-4). The bytes are checked here —
 * type by magic bytes, at most 1 MB, no EXIF/XMP — whatever the browser
 * claims. Paths are generated, never chosen by the caller. Before migration
 * 0019 (no bucket) the image comes back as an inline data URL, the old
 * storage, so nobody is blocked.
 */
export async function storePublicImage(
  ownerId: number,
  file: unknown
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose a photo." };
  if (file.size > 1_048_576) return { ok: false, error: "That photo is over 1 MB after resizing. Try another." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = checkIdImage(bytes, "photo");
  if (!checked.ok) return { ok: false, error: checked.error };
  const ext = checked.kind === "png" ? "png" : "jpg";
  const type = checked.kind === "png" ? "image/png" : "image/jpeg";

  const db = createAdminClient();
  const path = `${ownerId}/${randomUUID()}.${ext}`;
  const { error } = await db.storage.from("product-media").upload(path, bytes, { contentType: type, upsert: false });
  if (error) {
    if (/bucket not found|not found/i.test(error.message)) {
      return { ok: true, url: `data:${type};base64,${Buffer.from(bytes).toString("base64")}` };
    }
    console.error(`[media] upload: ${error.message}`);
    return { ok: false, error: "Could not upload the photo. Please try again." };
  }
  return { ok: true, url: db.storage.from("product-media").getPublicUrl(path).data.publicUrl };
}

/** Private buckets: readable only through signed URLs made after an app check. */
export type PrivateBucket = "message-media" | "payment-proofs";

/**
 * Store one image in a PRIVATE bucket (message photos, payment receipts),
 * with the same byte checks as storePublicImage. Returns the object path,
 * `<folder>/<uuid>.jpg|png`; the caller saves it and signs it to show it.
 * A missing bucket (migration not applied) is reported, not papered over:
 * private images never fall back to an inline data URL.
 */
export async function storePrivateImage(
  bucket: PrivateBucket,
  folder: number,
  file: unknown
): Promise<{ ok: true; path: string } | { ok: false; error: string; missing?: boolean }> {
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose a photo." };
  if (file.size > 1_048_576) return { ok: false, error: "That photo is over 1 MB after resizing. Try another." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = checkIdImage(bytes, "photo");
  if (!checked.ok) return { ok: false, error: checked.error };
  const ext = checked.kind === "png" ? "png" : "jpg";
  const type = checked.kind === "png" ? "image/png" : "image/jpeg";

  const path = `${Math.trunc(folder)}/${randomUUID()}.${ext}`;
  const { error } = await createAdminClient().storage.from(bucket).upload(path, bytes, { contentType: type, upsert: false });
  if (error) {
    if (/bucket not found|not found/i.test(error.message)) {
      return { ok: false, error: "Photos are not switched on yet.", missing: true };
    }
    console.error(`[media] private upload (${bucket}): ${error.message}`);
    return { ok: false, error: "Could not upload the photo. Please try again." };
  }
  return { ok: true, path };
}

/**
 * Signed URLs for private objects, keyed by path. Only call this after
 * checking that the viewer may see every path passed. Paths that fail to
 * sign are left out; the page shows "Photo unavailable" for them.
 */
export async function signPrivateImages(
  bucket: PrivateBucket,
  paths: string[],
  seconds: number
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await createAdminClient().storage.from(bucket).createSignedUrls(unique, seconds);
  if (error || !data) {
    console.error(`[media] sign (${bucket}): ${error?.message ?? "no data"}`);
    return {};
  }
  const out: Record<string, string> = {};
  for (const row of data) {
    if (row.path && row.signedUrl && !row.error) out[row.path] = row.signedUrl;
  }
  return out;
}

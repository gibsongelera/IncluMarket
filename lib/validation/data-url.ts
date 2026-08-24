import "server-only";

/**
 * Server-side validation for the base64 data URLs used as product images.
 *
 * Product images are stored as data URLs in im_product_images.url rather than
 * in a Storage bucket (see docs/REBUILD_PLAN.md). The seller UI enforces
 * `accept="image/*"` and a 1 MB cap, but that check lives entirely in the
 * browser — createProduct/updateProduct are server actions, i.e. public HTTP
 * endpoints, and accepted `images: string[]` with no type, size, scheme or
 * count check at all. A caller could write megabytes of arbitrary text into
 * every row.
 *
 * These strings are rendered into an `<img src>`, where a `javascript:` scheme
 * does not execute — so this is a storage-abuse and DoS control first, and a
 * defence against those URLs later reaching an `<a href>`, `srcset` or CSS
 * context second.
 */

export const MAX_IMAGES = 3;
/** 1 MB of decoded image data; base64 inflates by ~4/3 on the wire. */
export const MAX_DECODED_BYTES = 1_048_576;
/** Total decoded budget across all images on one product. */
export const MAX_TOTAL_DECODED_BYTES = 3 * MAX_DECODED_BYTES;

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/;

// C0/C1 control characters, deliberately keeping \t (0009) and \n (000A) so
// multi-line descriptions survive. Built with `new RegExp` from an escaped
// string so the source file itself stays plain ASCII.
const CONTROL_CHARS_RE = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]",
  "g"
);

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Decoded byte length of a base64 payload, without allocating a Buffer. */
function decodedBytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Validate a list of image data URLs.
 *
 * `undefined` is valid and means "leave the existing images alone" — only an
 * explicitly provided array is checked and replaced.
 */
export function validateImageDataUrls(
  input: unknown
): ValidationResult<string[] | undefined> {
  if (input === undefined || input === null) return { ok: true, value: undefined };
  if (!Array.isArray(input)) return { ok: false, error: "Images must be a list." };
  if (input.length > MAX_IMAGES) {
    return { ok: false, error: `Please upload at most ${MAX_IMAGES} images per product.` };
  }

  let total = 0;
  const clean: string[] = [];

  for (const [i, raw] of input.entries()) {
    if (typeof raw !== "string") {
      return { ok: false, error: `Image ${i + 1} is not valid image data.` };
    }
    const match = raw.match(DATA_URL_RE);
    if (!match) {
      return {
        ok: false,
        error: `Image ${i + 1} must be a JPEG, PNG, WebP or GIF file.`,
      };
    }
    const bytes = decodedBytes(match[2]);
    if (bytes > MAX_DECODED_BYTES) {
      return { ok: false, error: `Image ${i + 1} is larger than 1 MB. Please compress it.` };
    }
    total += bytes;
    if (total > MAX_TOTAL_DECODED_BYTES) {
      return { ok: false, error: "Those images are too large in total. Please compress them." };
    }
    clean.push(raw);
  }

  return { ok: true, value: clean };
}

/**
 * The `image` field is a short emoji/placeholder token, not a data URL.
 * Unbounded before; capped and stripped of control characters here.
 */
export function validateImageToken(input: unknown, fallback: string): string {
  if (typeof input !== "string") return fallback;
  const trimmed = input.replace(CONTROL_CHARS_RE, "").trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, 16);
}

/** Trim and hard-cap a free-text field that is otherwise unbounded. */
export function boundedText(
  input: unknown,
  max: number,
  fallback: string | null = null
): string | null {
  if (typeof input !== "string") return fallback;
  const trimmed = input.replace(CONTROL_CHARS_RE, "").trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, max);
}

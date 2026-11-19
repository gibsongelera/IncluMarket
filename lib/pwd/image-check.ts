/**
 * Server-side checks on an uploaded ID photo. Pure byte inspection, so it can
 * be unit-tested and needs no image library.
 *
 * The browser re-encodes every photo through a canvas before upload, which
 * drops EXIF and GPS data. The server cannot trust that happened — the action
 * is a public endpoint — so it checks the bytes itself:
 *   - type by magic bytes, never by file name or the declared MIME type
 *   - size at most 2 MB
 *   - no EXIF/XMP metadata (a photo taken on a phone carries the location)
 *   - dimensions large enough to read an ID
 */

export const MAX_ID_IMAGE_BYTES = 2 * 1024 * 1024;
export const MIN_ID_IMAGE_SIDE = 320;

export type IdImageKind = "jpeg" | "png";

export function sniffImage(bytes: Uint8Array): IdImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "png";
  return null;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let s = "";
  for (let i = start; i < start + length && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function u16be(bytes: Uint8Array, i: number): number {
  return (bytes[i] << 8) | bytes[i + 1];
}

function u32be(bytes: Uint8Array, i: number): number {
  return ((bytes[i] << 24) >>> 0) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3];
}

interface JpegScan {
  metadata: boolean;
  width: number;
  height: number;
}

/** Walks JPEG segments up to the image data. */
function scanJpeg(bytes: Uint8Array): JpegScan | null {
  let i = 2;
  let metadata = false;
  let width = 0;
  let height = 0;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // end of image / start of scan
    if (marker >= 0xd0 && marker <= 0xd7) {
      i += 2;
      continue;
    }
    const length = u16be(bytes, i + 2);
    if (length < 2 || i + 2 + length > bytes.length) return null;
    const payload = i + 4;
    if (marker === 0xe1) {
      const head = ascii(bytes, payload, 29);
      if (head.startsWith("Exif\0") || head.startsWith("http://ns.adobe.com/xap/")) metadata = true;
    }
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      height = u16be(bytes, payload + 1);
      width = u16be(bytes, payload + 3);
    }
    i += 2 + length;
  }
  return { metadata, width, height };
}

interface PngScan {
  metadata: boolean;
  width: number;
  height: number;
}

function scanPng(bytes: Uint8Array): PngScan | null {
  if (bytes.length < 33 || ascii(bytes, 12, 4) !== "IHDR") return null;
  const width = u32be(bytes, 16);
  const height = u32be(bytes, 20);
  let metadata = false;
  let i = 8;
  while (i + 8 <= bytes.length) {
    const length = u32be(bytes, i);
    const type = ascii(bytes, i + 4, 4);
    if (type === "eXIf" || type === "iTXt" || type === "tEXt" || type === "zTXt") metadata = true;
    if (type === "IEND") break;
    i += 12 + length;
  }
  return { metadata, width, height };
}

export type IdImageCheck =
  | { ok: true; kind: IdImageKind; width: number; height: number }
  | { ok: false; error: string };

export function checkIdImage(bytes: Uint8Array, label = "photo"): IdImageCheck {
  if (!bytes.length) return { ok: false, error: `The ${label} is missing.` };
  if (bytes.length > MAX_ID_IMAGE_BYTES) {
    return { ok: false, error: `The ${label} is larger than 2 MB. Retake it, or choose a smaller photo.` };
  }
  const kind = sniffImage(bytes);
  if (!kind) return { ok: false, error: `The ${label} must be a JPEG or PNG photo.` };

  const scan = kind === "jpeg" ? scanJpeg(bytes) : scanPng(bytes);
  if (!scan) return { ok: false, error: `The ${label} could not be read. Please take it again.` };
  if (scan.metadata) {
    // Only a photo that skipped the in-page camera or upload step gets here.
    return { ok: false, error: `Please add the ${label} using the buttons on this page.` };
  }
  if (Math.min(scan.width, scan.height) < MIN_ID_IMAGE_SIDE) {
    return { ok: false, error: `The ${label} is too small to read. Move closer, or use a larger photo.` };
  }
  return { ok: true, kind, width: scan.width, height: scan.height };
}

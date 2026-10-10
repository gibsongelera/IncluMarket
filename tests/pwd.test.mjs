import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkExpiry,
  cleanLgu,
  daysUntil,
  idLast4,
  manilaToday,
  maskPwdId,
  normalizePwdIdNumber,
} from "../lib/pwd/id-number.ts";
import { checkIdImage, sniffImage, MAX_ID_IMAGE_BYTES } from "../lib/pwd/image-check.ts";

test("PWD ID numbers are normalized to the national format", () => {
  assert.equal(normalizePwdIdNumber("09-7317-000-0001234"), "09-7317-000-0001234");
  assert.equal(normalizePwdIdNumber(" 0973170000001234 "), "09-7317-000-0001234");
  assert.equal(normalizePwdIdNumber("09 7317 000 0001234"), "09-7317-000-0001234");
  assert.equal(normalizePwdIdNumber("09–7317–000–0001234"), "09-7317-000-0001234", "en dashes from a phone keyboard");
});

test("anything that cannot be a PWD ID number is refused", () => {
  for (const bad of ["", "09-7317-000-000123", "09-7317-000-00012345", "AB-7317-000-0001234", "0973170000001234X"]) {
    assert.equal(normalizePwdIdNumber(bad), null, bad);
  }
});

test("only the last four digits are ever shown", () => {
  assert.equal(idLast4("09-7317-000-0001234"), "1234");
  assert.equal(maskPwdId("1234"), "••-••••-•••-•••1234");
  assert.ok(!maskPwdId("1234").includes("7317"));
  assert.equal(maskPwdId(null), "••-••••-•••-•••••••");
});

test("Manila date, not the server's UTC date", () => {
  // 2026-10-10 17:30 UTC is already 2026-10-11 in Manila (UTC+8).
  assert.equal(manilaToday(new Date("2026-10-10T17:30:00Z")), "2026-10-11");
  assert.equal(manilaToday(new Date("2026-10-10T15:59:00Z")), "2026-10-10");
});

test("expired IDs are rejected; real future dates pass", () => {
  const today = "2026-10-10";
  assert.equal(checkExpiry("2026-10-10", today).ok, false, "expires today");
  assert.equal(checkExpiry("2025-01-01", today).ok, false);
  assert.equal(checkExpiry("2026-10-11", today).ok, true);
  assert.equal(checkExpiry("2026-02-30", today).ok, false, "not a real date");
  assert.equal(checkExpiry("2040-01-01", today).ok, false, "longer than any PWD ID is valid");
  assert.equal(daysUntil("2026-11-09", today), 30);
});

test("issuing office is required and bounded", () => {
  assert.equal(cleanLgu("  Zamboanga   City PDAO ").ok, true);
  assert.equal(cleanLgu("  Zamboanga   City PDAO ").value, "Zamboanga City PDAO");
  assert.equal(cleanLgu("ab").ok, false);
  assert.equal(cleanLgu("x".repeat(121)).ok, false);
});

// --- image bytes -----------------------------------------------------------

function jpeg({ width = 800, height = 500, exif = false } = {}) {
  const seg = (marker, payload) => [0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload];
  const text = (s) => [...s].map((c) => c.charCodeAt(0));
  const parts = [0xff, 0xd8];
  parts.push(...seg(0xe0, [...text("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]));
  if (exif) parts.push(...seg(0xe1, [...text("Exif"), 0, 0, 0x4d, 0x4d, 0, 0x2a]));
  parts.push(...seg(0xc0, [8, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 1, 1, 0x11, 0]));
  parts.push(0xff, 0xda, 0, 2, 0xff, 0xd9);
  return new Uint8Array(parts);
}

function png({ width = 800, height = 500, text = false } = {}) {
  const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  const chunk = (type, data) => [...u32(data.length), ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  const bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  bytes.push(...chunk("IHDR", [...u32(width), ...u32(height), 8, 2, 0, 0, 0]));
  if (text) bytes.push(...chunk("tEXt", [...[..."GPS"].map((c) => c.charCodeAt(0)), 0, 49]));
  bytes.push(...chunk("IEND", []));
  return new Uint8Array(bytes);
}

test("file type comes from the bytes, not the name", () => {
  assert.equal(sniffImage(jpeg()), "jpeg");
  assert.equal(sniffImage(png()), "png");
  assert.equal(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  assert.equal(sniffImage(new TextEncoder().encode("GIF89a")), null);
});

test("a clean, readable photo passes", () => {
  const r = checkIdImage(jpeg());
  assert.equal(r.ok, true);
  assert.equal(r.width, 800);
  assert.equal(r.height, 500);
  assert.equal(checkIdImage(png()).ok, true);
});

test("photos still carrying EXIF or text metadata are refused", () => {
  assert.equal(checkIdImage(jpeg({ exif: true })).ok, false);
  assert.equal(checkIdImage(png({ text: true })).ok, false);
});

test("tiny, empty, oversized and non-image uploads are refused", () => {
  assert.equal(checkIdImage(jpeg({ width: 200, height: 120 })).ok, false);
  assert.equal(checkIdImage(new Uint8Array()).ok, false);
  const big = new Uint8Array(MAX_ID_IMAGE_BYTES + 1);
  big.set(jpeg());
  assert.equal(checkIdImage(big).ok, false);
  assert.match(checkIdImage(new TextEncoder().encode("%PDF-1.7"), "front of the ID").error, /front of the ID/);
});

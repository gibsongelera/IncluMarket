#!/usr/bin/env node
/**
 * Generates the app icons in public/icons from one drawing (C-48): the "IM"
 * brand mark, dark on gold, as in the header. The letters are drawn as
 * shapes, not text, so the result does not depend on installed fonts. They
 * sit inside the central 80% circle, so the same drawing works as a
 * maskable icon (Android crops it to a circle or squircle).
 *
 *   node scripts/make-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "icons");
fs.mkdirSync(OUT, { recursive: true });

const GOLD = "#F5C518"; // --palette-primary
const INK = "#212529"; // --text-charcoal (Guardrail 1: dark text on gold)

const letters = `
  <rect x="130" y="150" width="60" height="212" fill="${INK}"/>
  <polygon fill="${INK}" points="225,362 225,150 285,150 305,232 325,150 385,150 385,362 330,362 330,250 314,318 296,318 280,250 280,362"/>`;

function svg({ rounded }) {
  const bg = rounded
    ? `<rect width="512" height="512" rx="96" fill="${GOLD}"/>`
    : `<rect width="512" height="512" fill="${GOLD}"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${bg}${letters}</svg>`);
}

const jobs = [
  { file: "icon-32.png", size: 32, rounded: true },
  { file: "icon-192.png", size: 192, rounded: true },
  { file: "icon-512.png", size: 512, rounded: true },
  // Full-bleed: the platform applies its own mask or corner rounding.
  { file: "icon-maskable-512.png", size: 512, rounded: false },
  { file: "apple-touch-icon.png", size: 180, rounded: false },
];

for (const j of jobs) {
  await sharp(svg(j), { density: 72 * (j.size / 512) * 4 })
    .resize(j.size, j.size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, j.file));
  console.log(`public/icons/${j.file}`);
}

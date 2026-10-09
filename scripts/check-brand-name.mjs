#!/usr/bin/env node
/**
 * check-brand-name — the product is "InclusiveMarket", the ecosystem "InkluTrack".
 *
 * The code used four names for one product (IncluMarket in the UI, InkluMarket
 * in the proposal and package name, IncluTrack and InkluTrack for the
 * ecosystem — B-21). This fails when an old spelling appears in any code a
 * user can see: pages, components, lib (emails, chatbot, reports, payment
 * descriptors), scripts and styles.
 *
 * Kept on purpose and NOT checked: lowercase internal identifiers — the im_
 * table prefix, the inclumarket-* skill folders, the inclumarket.vercel.app
 * URL, cookie/storage keys and salts — and applied migrations, which must
 * never be edited.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const DIRS = ["app", "components", "lib", "scripts", "styles"];
const FILES = ["middleware.ts", "next.config.mjs", "package.json"];
const OLD = /\b(IncluMarket|InkluMarket|Inclumarket|IncluTrack)\b/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mjs|js|css|json)$/.test(name)) out.push(p);
  }
  return out;
}

const files = [...DIRS.flatMap((d) => walk(join(ROOT, d))), ...FILES.map((f) => join(ROOT, f))];
const findings = [];
for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join("/");
  if (rel === "scripts/check-brand-name.mjs") continue;
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      const m = line.match(OLD);
      if (m) findings.push(`${rel}:${i + 1}  "${m[1]}" — use InclusiveMarket (product) or InkluTrack (ecosystem)`);
    });
}

const layout = readFileSync(join(ROOT, "app/layout.tsx"), "utf8");
if (!/InclusiveMarket/.test(layout)) findings.push("app/layout.tsx  site metadata does not name InclusiveMarket");

console.log("check-brand-name");
if (findings.length) {
  for (const f of findings) console.log("  " + f);
  console.log(`\n  ${findings.length} finding(s).`);
  process.exit(1);
}
console.log("  Clean — InclusiveMarket / InkluTrack everywhere a user can see.");

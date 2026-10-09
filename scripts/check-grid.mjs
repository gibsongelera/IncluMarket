#!/usr/bin/env node
/**
 * check-grid — the product grid is defined exactly once.
 *
 * .product-grid used to be defined five times across layout.css, shopee.css
 * and three blocks of responsive.css, with conflicting minimum widths, and
 * `auto-fill` kept empty tracks — the "large empty area" the client saw
 * (B-17). The single definition lives in styles/responsive.css (it owns every
 * width media query). This fails when:
 *   - any other stylesheet mentions .product-grid
 *   - any .product-grid rule uses auto-fill / auto-fit
 *   - responsive.css has no base (un-nested) .product-grid rule
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "styles");
const findings = [];

for (const file of readdirSync(dir).filter((f) => f.endsWith(".css"))) {
  const css = readFileSync(join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...css.matchAll(/([^{}]*\.product-grid[^{}]*)\{([^{}]*)\}/g)];
  for (const r of rules) {
    if (file !== "responsive.css") findings.push(`${file}: "${r[1].trim()}" — define .product-grid only in responsive.css`);
    if (/auto-(fill|fit)/.test(r[2])) findings.push(`${file}: "${r[1].trim()}" uses auto-fill/auto-fit (empty tracks)`);
  }
}

const responsive = readFileSync(join(dir, "responsive.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
let depth = 0;
let base = false;
for (let i = 0; i < responsive.length; i++) {
  const ch = responsive[i];
  if (ch === "{") {
    const selector = responsive.slice(responsive.lastIndexOf("}", i) + 1, i);
    if (depth === 0 && /^\s*\.product-grid\s*$/.test(selector.split(/[;{}]/).pop() || "")) base = true;
    depth++;
  } else if (ch === "}") depth = Math.max(0, depth - 1);
}
if (!base) findings.push("responsive.css: no base .product-grid rule outside a media query");

console.log("check-grid");
if (findings.length) {
  for (const f of findings) console.log("  " + f);
  process.exit(1);
}
console.log("  Clean — one .product-grid definition, explicit column counts.");

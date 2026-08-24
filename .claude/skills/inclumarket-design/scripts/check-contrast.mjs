#!/usr/bin/env node
/**
 * IncluMarket contrast and token checker.
 *
 * Catches the three token mistakes that have each shipped to users:
 *   1. a background-only token used for `color:`  (white-on-white text)
 *   2. `var(--x)` where --x is never defined      (silently dropped)
 *   3. a colour pair below the WCAG AA threshold
 *
 * Zero dependencies. Run:
 *   node .claude/skills/inclumarket-design/scripts/check-contrast.mjs
 *
 * Exit 0 = clean, 1 = findings.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const STYLES = path.join(ROOT, "styles");

/** Tokens that must never appear as a `color:` value. */
const BACKGROUND_ONLY = new Set([
  "--canvas-white",
  "--surface-gray",
  "--surface-gray-2",
  "--color-body",
  "--color-body-bg",
  "--bg-rainbow",
]);

const findings = [];
const note = (level, file, line, message) => findings.push({ level, file, line, message });

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6 || /[^0-9a-f]/i.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]) {
  const f = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}

function contrast(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// Token collection
// ---------------------------------------------------------------------------

function readIfExists(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

/** Every `--name: value;` declaration in a string, as a Map. */
function collectDeclarations(source) {
  const map = new Map();
  for (const m of source.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi)) {
    map.set(m[1].trim(), m[2].trim());
  }
  return map;
}

const tokensCss = readIfExists(path.join(STYLES, "tokens.css"));
const themeTs = readIfExists(path.join(ROOT, "lib", "theme.ts"));

const baseTokens = collectDeclarations(tokensCss);

// Token names any theme preset can supply.
const themeTokenNames = new Set();
for (const m of themeTs.matchAll(/"(--[a-z0-9-]+)"\s*:/gi)) themeTokenNames.add(m[1]);

/** Resolve a value through var() chains to an rgb triple, or null. */
function resolve(value, tokens, depth = 0) {
  if (!value || depth > 10) return null;
  const v = value.trim();

  const hex = v.match(/#[0-9a-f]{3,8}\b/i);
  if (hex && !v.includes("var(")) return hexToRgb(hex[0]);

  const varMatch = v.match(/var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)/i);
  if (varMatch) {
    const name = varMatch[1];
    if (tokens.has(name)) return resolve(tokens.get(name), tokens, depth + 1);
    if (varMatch[2]) return resolve(varMatch[2], tokens, depth + 1);
    return null;
  }

  if (hex) return hexToRgb(hex[0]);
  return null;
}

const allDefined = new Set([...baseTokens.keys(), ...themeTokenNames]);

// ---------------------------------------------------------------------------
// Scan stylesheets
// ---------------------------------------------------------------------------

const cssFiles = fs.existsSync(STYLES)
  ? fs.readdirSync(STYLES).filter((f) => f.endsWith(".css"))
  : [];

// Blank out CSS comments while preserving line numbers, so that prose
// describing a bug is not reported as the bug. tokens.css documents the
// background-only token rule by quoting the broken declaration, and without
// this the checker flags its own documentation.
const CSS_COMMENT_RE = new RegExp("/\\*[\\s\\S]*?\\*/", "g");
const NON_NEWLINE_RE = new RegExp("[^\\n]", "g");

function stripComments(source) {
  return source.replace(CSS_COMMENT_RE, (m) => m.replace(NON_NEWLINE_RE, " "));
}

for (const file of cssFiles) {
  const source = stripComments(fs.readFileSync(path.join(STYLES, file), "utf8"));
  const rel = `styles/${file}`;

  source.split("\n").forEach((line, i) => {
    const lineNo = i + 1;

    // Undefined var() references.
    for (const m of line.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
      if (!allDefined.has(m[1])) {
        note("error", rel, lineNo, `var(${m[1]}) is never defined. Did you mean --text-muted?`);
      }
    }

    // Background-only token used as a text colour.
    const colorDecl = line.match(/(?<!-)\bcolor\s*:\s*([^;]+)/i);
    if (colorDecl) {
      const used = colorDecl[1].match(/var\(\s*(--[a-z0-9-]+)/i);
      if (used && BACKGROUND_ONLY.has(used[1])) {
        note(
          "error",
          rel,
          lineNo,
          `${used[1]} is a BACKGROUND-only token used for color: — this renders invisible text. Write #FFFFFF explicitly if light text is intended.`
        );
      }
    }
  });

  // Contrast of color/background pairs declared in the same rule.
  for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim().replace(/\s+/g, " ");
    const body = rule[2];
    if (selector.startsWith("@") || selector.startsWith(":root")) continue;

    const fg = body.match(/(?<!-)\bcolor\s*:\s*([^;]+)/i);
    const bg = body.match(/\bbackground(?:-color)?\s*:\s*([^;]+)/i);
    if (!fg || !bg) continue;

    const fgRgb = resolve(fg[1], baseTokens);
    const bgRgb = resolve(bg[1], baseTokens);
    if (!fgRgb || !bgRgb) continue;

    const ratio = contrast(fgRgb, bgRgb);
    const sizeMatch = body.match(/font-size\s*:\s*([\d.]+)rem/i);
    const isLarge =
      (sizeMatch && parseFloat(sizeMatch[1]) >= 1.5) || /font-weight\s*:\s*[89]00/.test(body);
    const threshold = isLarge ? 3 : 4.5;

    if (ratio < threshold) {
      const lineNo = source.slice(0, rule.index).split("\n").length;
      note(
        "error",
        rel,
        lineNo,
        `${selector} — ${ratio.toFixed(2)}:1 (needs ${threshold}:1). fg "${fg[1].trim()}" on bg "${bg[1].trim()}".`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Inline colour props in TSX
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(p, out);
    } else if (entry.name.endsWith(".tsx")) {
      out.push(p);
    }
  }
  return out;
}

for (const file of [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "components"))]) {
  const source = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  source.split("\n").forEach((line, i) => {
    const m = line.match(/\bcolor:\s*"var\((--[a-z0-9-]+)\)"/i);
    if (!m) return;
    if (BACKGROUND_ONLY.has(m[1])) {
      note("error", rel, i + 1, `${m[1]} is a BACKGROUND-only token used for color: — invisible text.`);
    } else if (!allDefined.has(m[1])) {
      note("error", rel, i + 1, `var(${m[1]}) is never defined.`);
    }
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const errors = findings.filter((f) => f.level === "error");

if (!findings.length) {
  console.log(
    "check-contrast: clean — no undefined tokens, no misused background tokens, no failing pairs."
  );
  process.exit(0);
}

console.log(`\ncheck-contrast: ${errors.length} finding(s)\n`);
for (const f of findings) {
  console.log(`  ${f.file}:${f.line}\n    ${f.message}\n`);
}

process.exit(errors.length ? 1 : 0);

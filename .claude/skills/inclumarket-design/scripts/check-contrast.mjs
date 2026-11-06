#!/usr/bin/env node
/**
 * InclusiveMarket contrast and token checker.
 *
 * Catches the three token mistakes that have each shipped to users:
 *   1. a background-only token used for `color:`  (white-on-white text)
 *   2. `var(--x)` where --x is never defined      (silently dropped)
 *   3. a colour pair below the WCAG AA threshold
 *
 * Pairs are measured the way the browser resolves them: under every theme
 * preset, and again with high contrast on (8 presets x 2 = 16 scenarios).
 * Each scenario starts from the `:root` block of styles/tokens.css, layers
 * the preset the root layout injects on top (`resolveThemeVars()` from
 * lib/theme.ts, selector `html:root`), and for high contrast layers
 * `:root[data-contrast="high"]` over that: the order the cascade applies
 * them in. var() chains, var() fallbacks, hsl() and `color-mix(in srgb, ...)`
 * are resolved, and translucent text is blended over its background. A
 * translucent background or a gradient is not measured, because its contrast
 * depends on what is behind it; those pairs are counted in the summary and
 * listed with --table.
 *
 * Two sources of pairs:
 *   - a rule that declares both `color` and `background` (the last
 *     declaration of each wins, as in the browser). A rule that declares
 *     `--focus-ring` has its ring measured against the background the same
 *     rule declares, at 3:1: that is how the dark surfaces in tokens.css
 *     swap in a ring they can show, and a ring with no background beside it
 *     is an error. A rule whose selectors all need `[data-contrast="high"]`
 *     is measured only with high contrast on, and one whose selectors all
 *     sit under `:not([data-contrast="high"])` only with it off;
 *   - REQUIRED_PAIRS below, for colours that meet across rules: text on the
 *     page, a link on a card, white on a button, the page focus ring.
 *
 * Zero dependencies: lib/theme.ts is imported directly (Node strips its
 * types). Run:
 *   node .claude/skills/inclumarket-design/scripts/check-contrast.mjs
 *   node .claude/skills/inclumarket-design/scripts/check-contrast.mjs --table
 *     (also lists the lowest ratio of every required pair and where it is,
 *     and every rule pair that could not be measured)
 *
 * Exit 0 = clean, 1 = findings.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const STYLES = path.join(ROOT, "styles");
const SHOW_TABLE = process.argv.includes("--table");

/** Tokens that must never appear as a `color:` value. */
const BACKGROUND_ONLY = new Set([
  "--canvas-white",
  "--surface-gray",
  "--surface-gray-2",
  "--color-body",
  "--color-body-bg",
  "--bg-rainbow",
]);

/**
 * Colour pairs that meet across rules, so no single rule declares both.
 * `fg` and `bg` are a token name or a literal colour. `min` is 4.5 for text;
 * 3 for large text, graphics, control outlines and focus rings (WCAG 1.4.3,
 * 1.4.11). These are the guardrails written at the top of styles/tokens.css.
 */
const REQUIRED_PAIRS = [
  // Guardrail 1: dark text on light surfaces.
  { fg: "--text-charcoal", bg: "--canvas-white", min: 4.5, what: "body text on a card" },
  { fg: "--text-charcoal", bg: "--color-body", min: 4.5, what: "body text on the page" },
  { fg: "--text-charcoal", bg: "--surface-gray", min: 4.5, what: "body text on a grey well or table header" },
  { fg: "--text-muted", bg: "--canvas-white", min: 4.5, what: "secondary text on a card" },
  { fg: "--text-muted", bg: "--color-body", min: 4.5, what: "secondary text on the page" },
  { fg: "--text-muted", bg: "--surface-gray", min: 4.5, what: "secondary text on a grey well" },
  { fg: "--brand-blue", bg: "--canvas-white", min: 4.5, what: "a link on a card" },
  { fg: "--brand-blue", bg: "--color-body", min: 4.5, what: "a link on the page" },
  { fg: "--brand-brown", bg: "--canvas-white", min: 4.5, what: "a price on a card" },
  { fg: "--brand-brown", bg: "--brand-brown-100", min: 4.5, what: "brown text on its tint" },
  { fg: "--danger", bg: "--canvas-white", min: 4.5, what: "an error message" },
  { fg: "--warning-text", bg: "--canvas-white", min: 4.5, what: "warning text on a card" },
  { fg: "--warning-text", bg: "--warning-100", min: 4.5, what: "warning text on its tint" },
  { fg: "--warning-text", bg: "--surface-gray", min: 4.5, what: "warning text on a grey well" },
  // Guardrail 2: white text on dark surfaces.
  { fg: "#FFFFFF", bg: "--brand-blue", min: 4.5, what: "a primary button" },
  { fg: "#FFFFFF", bg: "--brand-brown", min: 4.5, what: "a sale or count badge" },
  { fg: "#FFFFFF", bg: "--danger", min: 4.5, what: "a destructive button" },
  { fg: "--color-nav-text", bg: "--color-nav", min: 4.5, what: "header and sidebar links" },
  { fg: "--color-footer-text", bg: "--color-footer", min: 4.5, what: "footer text" },
  // Chart series: graphics, 3:1 on the card they are drawn on. --chart-6 is
  // for segments only, never text.
  { fg: "--chart-1", bg: "--canvas-white", min: 3, what: "chart series 1 on a card" },
  { fg: "--chart-2", bg: "--canvas-white", min: 3, what: "chart series 2 on a card" },
  { fg: "--chart-3", bg: "--canvas-white", min: 3, what: "chart series 3 on a card" },
  { fg: "--chart-4", bg: "--canvas-white", min: 3, what: "chart series 4 on a card" },
  { fg: "--chart-5", bg: "--canvas-white", min: 3, what: "chart series 5 on a card" },
  { fg: "--chart-6", bg: "--canvas-white", min: 3, what: "chart series 6 on a card" },
  // Focus rings, 3:1 against what they are drawn on. The page ring is
  // measured here; each dark surface declares its own ring next to its
  // background, and the rule scan measures it there.
  { fg: "--focus-ring", bg: "--canvas-white", min: 3, what: "the focus ring on a card" },
  { fg: "--focus-ring", bg: "--color-body", min: 3, what: "the focus ring on the page" },
  { fg: "--focus-ring", bg: "--surface-gray", min: 3, what: "the focus ring on a grey well" },
  { fg: "--focus-ring-nav", bg: "--color-nav", min: 3, what: "the focus ring in the header" },
  { fg: "--focus-ring-footer", bg: "--color-footer", min: 3, what: "the focus ring in the footer" },
];

const findings = [];
const note = (level, file, line, message) => findings.push({ level, file, line, message });

// ---------------------------------------------------------------------------
// Colour maths. A resolved colour is [r, g, b, alpha], channels 0-255.
// ---------------------------------------------------------------------------

function hexToRgba(hex) {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 || h.length === 4 ? h.split("").map((c) => c + c).join("") : h;
  if ((full.length !== 6 && full.length !== 8) || /[^0-9a-f]/i.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
    full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
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

/** A translucent colour painted over an opaque one. */
function over(fg, bg) {
  if (fg[3] >= 1) return fg;
  return [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
}

// ---------------------------------------------------------------------------
// Resolving a CSS colour value against a token map
// ---------------------------------------------------------------------------

const NAMED = {
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
  transparent: [0, 0, 0, 0],
};

/** Index of the parenthesis that closes the one at `open`, or -1. */
function closeParen(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/** Split on commas that are not inside parentheses. */
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseAlpha(s) {
  if (s == null) return 1;
  const a = s.endsWith("%") ? parseFloat(s) / 100 : parseFloat(s);
  return Math.min(1, Math.max(0, a));
}

function parseRgb(v) {
  const m = v.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i
  );
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), parseAlpha(m[4])];
}

/** hsl() and hsla(), comma or space syntax; the hue in deg (the default), turn or rad. */
function parseHsl(v) {
  const m = v.match(
    /^hsla?\(\s*(-?[\d.]+)(deg|turn|rad)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i
  );
  if (!m) return null;
  const unit = (m[2] || "deg").toLowerCase();
  let h = parseFloat(m[1]);
  if (unit === "turn") h *= 360;
  if (unit === "rad") h = (h * 180) / Math.PI;
  h = ((h % 360) + 360) % 360;
  const s = Math.min(1, parseFloat(m[3]) / 100);
  const l = Math.min(1, parseFloat(m[4]) / 100);
  // The hslToRgb() of CSS Color 4.
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255, parseAlpha(m[5])];
}

/** One stop of a color-mix(): `var(--x) 8%`, `8% var(--x)` or `var(--x)`. */
function mixStop(s) {
  let m = s.match(/^([\d.]+)%\s+([\s\S]+)$/);
  if (m) return { color: m[2], pct: parseFloat(m[1]) };
  m = s.match(/^([\s\S]+?)\s+([\d.]+)%$/);
  if (m) return { color: m[1], pct: parseFloat(m[2]) };
  return { color: s, pct: null };
}

/**
 * color-mix(in srgb, a p%, b q%) as CSS Color 5 defines it: channels mixed in
 * gamma-encoded sRGB with premultiplied alpha, and percentages that add up to
 * less than 100% leave the result that much translucent.
 */
function resolveMix(inner, tokens, depth) {
  const parts = splitTop(inner);
  if (parts.length !== 3 || !/^in\s+srgb$/i.test(parts[0])) return null;
  const a = mixStop(parts[1]);
  const b = mixStop(parts[2]);
  let pa = a.pct;
  let pb = b.pct;
  if (pa == null && pb == null) pa = pb = 50;
  else if (pa == null) pa = 100 - pb;
  else if (pb == null) pb = 100 - pa;
  const sum = pa + pb;
  if (!(sum > 0)) return null;
  const ca = resolve(a.color, tokens, depth + 1);
  const cb = resolve(b.color, tokens, depth + 1);
  if (!ca || !cb) return null;
  const wa = pa / sum;
  const wb = pb / sum;
  const alpha = ca[3] * wa + cb[3] * wb;
  if (alpha === 0) return [0, 0, 0, 0];
  const rgb = [0, 1, 2].map((i) => (ca[i] * ca[3] * wa + cb[i] * cb[3] * wb) / alpha);
  return [...rgb, alpha * Math.min(1, sum / 100)];
}

/** Resolve a value to [r, g, b, alpha] through var() chains and color-mix(), or null. */
function resolve(value, tokens, depth = 0) {
  if (!value || depth > 20) return null;
  const v = value.trim().replace(/\s*!important$/i, "");
  const lower = v.toLowerCase();
  if (/gradient\(|url\(/.test(lower)) return null; // depends on what is painted

  if (lower.startsWith("var(") && closeParen(v, 3) === v.length - 1) {
    const [name, ...fallback] = splitTop(v.slice(4, -1));
    if (tokens.has(name)) return resolve(tokens.get(name), tokens, depth + 1);
    return fallback.length ? resolve(fallback.join(","), tokens, depth + 1) : null;
  }
  if (lower.startsWith("color-mix(") && closeParen(v, 9) === v.length - 1) {
    return resolveMix(v.slice(10, -1), tokens, depth);
  }
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return hexToRgba(v);
  if (/^rgba?\(/.test(lower)) return parseRgb(v);
  if (/^hsla?\(/.test(lower)) return parseHsl(v);
  if (NAMED[lower]) return NAMED[lower];

  // A shorthand such as `1px solid var(--border)`: resolve its first colour.
  const m = v.match(/var\(|color-mix\(|rgba?\(|hsla?\(|#[0-9a-f]{3,8}\b/i);
  if (!m) return null;
  if (m[0].startsWith("#")) return hexToRgba(m[0]);
  const end = closeParen(v, m.index + m[0].length - 1);
  if (end < 0) return null;
  const sub = v.slice(m.index, end + 1);
  return sub === v ? null : resolve(sub, tokens, depth + 1);
}

const asValue = (tokenOrColour) =>
  tokenOrColour.startsWith("--") ? `var(${tokenOrColour})` : tokenOrColour;

// ---------------------------------------------------------------------------
// Token collection
// ---------------------------------------------------------------------------

function readIfExists(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

// Blank out CSS comments while preserving line numbers, so that prose
// describing a bug is not reported as the bug. tokens.css documents the
// background-only token rule by quoting the broken declaration, and without
// this the checker flags its own documentation.
const CSS_COMMENT_RE = new RegExp("/\\*[\\s\\S]*?\\*/", "g");
const NON_NEWLINE_RE = new RegExp("[^\\n]", "g");

function stripComments(source) {
  return source.replace(CSS_COMMENT_RE, (m) => m.replace(NON_NEWLINE_RE, " "));
}

/** Every `--name: value;` declaration in a string, as a Map. */
function collectDeclarations(source) {
  const map = new Map();
  for (const m of source.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi)) {
    map.set(m[1].trim(), m[2].trim());
  }
  return map;
}

/** The declarations of the first rule whose selector is exactly `selector`. */
function blockDeclarations(source, selector) {
  for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].trim().replace(/\s+/g, " ") === selector) return collectDeclarations(m[2]);
  }
  return new Map();
}

const tokensCss = stripComments(readIfExists(path.join(STYLES, "tokens.css")));
const themeTs = readIfExists(path.join(ROOT, "lib", "theme.ts"));

const rootTokens = blockDeclarations(tokensCss, ":root");
const highContrastTokens = blockDeclarations(tokensCss, ':root[data-contrast="high"]');

// lib/theme.ts is TypeScript, imported as-is. Silence only the "module type
// is not specified" notice that this import prints; every other warning shows.
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.code !== "MODULE_TYPELESS_PACKAGE_JSON") console.warn(`${w.name}: ${w.message}`);
});
const theme = await import(pathToFileURL(path.join(ROOT, "lib", "theme.ts")).href);

const scenarios = [];
for (const id of Object.keys(theme.THEME_PRESETS)) {
  const preset = new Map([
    ...rootTokens,
    ...Object.entries(theme.resolveThemeVars({ theme_preset: id })),
  ]);
  scenarios.push({ name: id, highContrast: false, tokens: preset });
  scenarios.push({
    name: `${id} + high contrast`,
    highContrast: true,
    tokens: new Map([...preset, ...highContrastTokens]),
  });
}

// Every name that is defined somewhere, for the undefined-var() check.
const baseTokens = collectDeclarations(tokensCss);

// Token names any theme preset can supply.
const themeTokenNames = new Set();
for (const m of themeTs.matchAll(/"(--[a-z0-9-]+)"\s*:/gi)) themeTokenNames.add(m[1]);

// next/font sets its CSS variables on <html> from app/fonts.ts (variable: "--x").
const fontVarNames = new Set();
const fontsTs = path.join(ROOT, "app", "fonts.ts");
if (fs.existsSync(fontsTs)) {
  for (const m of fs.readFileSync(fontsTs, "utf8").matchAll(/variable:\s*"(--[a-z0-9-]+)"/gi)) {
    fontVarNames.add(m[1]);
  }
}

const allDefined = new Set([...baseTokens.keys(), ...themeTokenNames, ...fontVarNames]);

// ---------------------------------------------------------------------------
// Measuring a pair in every scenario
// ---------------------------------------------------------------------------

/**
 * Ratios of fg on bg in each scenario that can resolve both, with the failing
 * ones listed, and the reason when no scenario could be measured.
 */
function measure(fg, bg, min, { mode = "both" } = {}) {
  const failing = [];
  let lowest = null;
  let reason = null;
  for (const s of scenarios) {
    if (mode === "high" && !s.highContrast) continue;
    if (mode === "normal" && s.highContrast) continue;
    const a = resolve(fg, s.tokens);
    const b = resolve(bg, s.tokens);
    if (!a || !b) {
      reason ??= "a value it cannot resolve (a gradient, an image or a keyword)";
      continue;
    }
    if (b[3] < 1) {
      reason ??= "a translucent background, so it depends on what is behind";
      continue;
    }
    if (a[3] === 0) {
      reason ??= "transparent text";
      continue;
    }
    const ratio = contrast(over(a, b), b);
    if (!lowest || ratio < lowest.ratio) lowest = { ratio, scenario: s.name };
    if (ratio < min) failing.push(`${s.name} ${ratio.toFixed(2)}:1`);
  }
  return { failing, lowest, reason };
}

// ---------------------------------------------------------------------------
// Scan stylesheets
// ---------------------------------------------------------------------------

const cssFiles = fs.existsSync(STYLES)
  ? fs.readdirSync(STYLES).filter((f) => f.endsWith(".css"))
  : [];

const COLOR_RE = /(?<![\w-])color\s*:\s*([^;]+)/gi;
const BACKGROUND_RE = /(?<![\w-])background(?:-color)?\s*:\s*([^;]+)/gi;
const FOCUS_RING_RE = /(?<![\w-])--focus-ring\s*:\s*([^;]+)/gi;
const HIGH_CONTRAST_RE = /\[data-contrast="?high"?\]/;
const NOT_HIGH_CONTRAST_RE = /:not\(\s*\[data-contrast="?high"?\]\s*\)/;
const NOT_GROUP_RE = /:not\([^()]*\)/g;
const ROOT_ONLY_RE = /^:root(\[[^\]]*\])*$/; // token blocks, read above

/**
 * The scenarios a selector list applies in: "high" when every selector needs
 * high contrast, "normal" when every one sits under :not([data-contrast=high]),
 * otherwise "both".
 */
function contrastMode(selector) {
  const modes = new Set(
    splitTop(selector).map((part) => {
      if (HIGH_CONTRAST_RE.test(part.replace(NOT_GROUP_RE, ""))) return "high";
      if (NOT_HIGH_CONTRAST_RE.test(part)) return "normal";
      return "both";
    })
  );
  return modes.size === 1 ? [...modes][0] : "both";
}

/** The value the browser uses from one rule: the last declaration, or the last !important one. */
function winning(body, re) {
  let value = null;
  let important = false;
  for (const m of body.matchAll(re)) {
    const v = m[1].trim();
    const isImportant = /!important$/i.test(v);
    if (isImportant || !important) {
      value = v;
      important = important || isImportant;
    }
  }
  return value;
}

let rulePairs = 0;
let ringPairs = 0;
const unmeasured = [];

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

  // Text, and a rule's own focus ring, against the background the same rule declares.
  for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim().replace(/\s+/g, " ");
    const body = rule[2];
    if (selector.startsWith("@") || ROOT_ONLY_RE.test(selector)) continue;

    const bg = winning(body, BACKGROUND_RE);
    const fg = winning(body, COLOR_RE);
    const ring = winning(body, FOCUS_RING_RE);
    if (!ring && !(fg && bg)) continue;

    // The selector's own line, not the end of whatever came before it.
    const lineNo = source.slice(0, rule.index + Math.max(0, rule[1].search(/\S/))).split("\n").length;
    const mode = contrastMode(selector);

    if (ring && !bg) {
      note(
        "error",
        rel,
        lineNo,
        `${selector} sets --focus-ring with no background in the same rule, so the ring cannot be measured. Declare it in the rule that paints the surface it sits on (tokens.css focus-ring notes).`
      );
      continue;
    }

    if (fg) {
      // WCAG large text: at least 18pt, or 14pt bold (1.5rem / 1.1667rem at the
      // 16px default). Weight alone does not make text large; a rule that sets
      // no font-size is measured as normal text.
      const sizeMatch = body.match(/font-size\s*:\s*([\d.]+)rem/i);
      const size = sizeMatch ? parseFloat(sizeMatch[1]) : 0;
      const bold = /font-weight\s*:\s*([7-9]00|bold)/i.test(body);
      const isLarge = size >= 1.5 || (bold && size >= 1.1667);
      const threshold = isLarge ? 3 : 4.5;

      const { failing, lowest, reason } = measure(fg, bg, threshold, { mode });
      if (lowest) rulePairs++;
      else unmeasured.push({ where: `${rel}:${lineNo}`, selector, what: "text", reason });
      if (failing.length) {
        note(
          "error",
          rel,
          lineNo,
          `${selector} — needs ${threshold}:1. fg "${fg}" on bg "${bg}" fails under: ${failing.join(", ")}.`
        );
      }
    }

    if (ring) {
      const { failing, lowest, reason } = measure(ring, bg, 3, { mode });
      if (lowest) ringPairs++;
      else unmeasured.push({ where: `${rel}:${lineNo}`, selector, what: "focus ring", reason });
      if (failing.length) {
        note(
          "error",
          rel,
          lineNo,
          `${selector} — its focus ring needs 3:1 on the background this rule declares. Ring "${ring}" on bg "${bg}" fails under: ${failing.join(", ")}.`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Required pairs
// ---------------------------------------------------------------------------

const table = [];
for (const pair of REQUIRED_PAIRS) {
  const { failing, lowest, reason } = measure(asValue(pair.fg), asValue(pair.bg), pair.min);
  table.push({ pair, lowest, ok: !failing.length });
  if (!lowest) {
    note(
      "error",
      "REQUIRED_PAIRS",
      0,
      `${pair.fg} on ${pair.bg} (${pair.what}) could not be measured in any scenario: ${reason}.`
    );
  } else if (failing.length) {
    note(
      "error",
      "REQUIRED_PAIRS",
      0,
      `${pair.fg} on ${pair.bg} (${pair.what}) — needs ${pair.min}:1; fails under: ${failing.join(", ")}.`
    );
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

const presetCount = scenarios.length / 2;
const scope =
  `${scenarios.length} scenarios (${presetCount} presets, high contrast off and on), ` +
  `${rulePairs} rule pairs, ${ringPairs} focus rings, ${REQUIRED_PAIRS.length} required pairs` +
  (unmeasured.length ? ` (${unmeasured.length} more could not be measured; --table lists them)` : "");

if (SHOW_TABLE) {
  console.log(`\nRequired pairs — lowest ratio across ${scope}:\n`);
  for (const { pair, lowest, ok } of table) {
    const where = lowest ? `${lowest.ratio.toFixed(2)}:1 under ${lowest.scenario}` : "unresolved";
    console.log(`  ${ok ? "ok  " : "FAIL"} ${pair.fg} on ${pair.bg} (${pair.what}), needs ${pair.min}:1 — lowest ${where}`);
  }
  if (unmeasured.length) {
    console.log(`\nRule pairs that could not be measured (not failures):\n`);
    for (const u of unmeasured) console.log(`  ${u.where} ${u.selector} (${u.what}): ${u.reason}`);
  }
  console.log("");
}

const errors = findings.filter((f) => f.level === "error");

if (!findings.length) {
  console.log(
    `check-contrast: clean — no undefined tokens, no misused background tokens, no failing pairs across ${scope}.`
  );
  process.exit(0);
}

console.log(`\ncheck-contrast: ${errors.length} finding(s) across ${scope}\n`);
for (const f of findings) {
  console.log(`  ${f.line ? `${f.file}:${f.line}` : f.file}\n    ${f.message}\n`);
}

process.exit(errors.length ? 1 : 0);

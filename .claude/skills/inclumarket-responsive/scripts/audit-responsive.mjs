#!/usr/bin/env node
/**
 * IncluMarket static responsive audit.
 *
 * Flags the patterns that have actually broken this layout on phones:
 *   - width media queries declared outside styles/responsive.css
 *   - max-width queries (the convention is mobile-first min-width)
 *   - fixed px widths and min-widths on layout elements
 *   - hardcoded px offsets on sticky/fixed elements, which break at the 24px
 *     accessibility font setting
 *   - bare z-index values instead of the named scale
 *   - fixed width/height attributes on <canvas>
 *
 * Zero dependencies. Run:
 *   node .claude/skills/inclumarket-responsive/scripts/audit-responsive.mjs
 *
 * Exit 0 = clean, 1 = findings.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const STYLES = path.join(ROOT, "styles");

const CSS_COMMENT_RE = new RegExp("/\\*[\\s\\S]*?\\*/", "g");
const NON_NEWLINE_RE = new RegExp("[^\\n]", "g");
const stripComments = (s) => s.replace(CSS_COMMENT_RE, (m) => m.replace(NON_NEWLINE_RE, " "));

const findings = [];
const note = (level, file, line, message) => findings.push({ level, file, line, message });

// Properties where a fixed px value pins layout width.
const WIDTH_PROPS = /^\s*(min-width|max-width|width|flex-basis|grid-template-columns)\s*:/i;

// Files allowed to declare width media queries.
const BREAKPOINT_OWNER = "responsive.css";

// Landing/auth is a self-contained marketing surface with its own breakpoints,
// predating the convention. Flagged as info rather than error.
const LEGACY_BREAKPOINT_FILES = new Set(["landing.css"]);

const cssFiles = fs.existsSync(STYLES)
  ? fs.readdirSync(STYLES).filter((f) => f.endsWith(".css"))
  : [];

for (const file of cssFiles) {
  const raw = fs.readFileSync(path.join(STYLES, file), "utf8");
  const source = stripComments(raw);
  const rel = `styles/${file}`;

  source.split("\n").forEach((line, i) => {
    const lineNo = i + 1;

    // --- media queries -----------------------------------------------------
    if (/@media[^{]*\b(min-width|max-width)\b/.test(line)) {
      const isMaxWidth = /max-width/.test(line);
      if (file !== BREAKPOINT_OWNER) {
        note(
          LEGACY_BREAKPOINT_FILES.has(file) ? "info" : "error",
          rel,
          lineNo,
          `width media query outside ${BREAKPOINT_OWNER}. All breakpoints belong in one file.`
        );
      } else if (isMaxWidth && !/data-table--cards|mobile-nav|a11y-widget|chat-widget|toast-region|btn--sm|form-actions|filter-bar|page-head/.test(source.slice(source.indexOf(line), source.indexOf(line) + 600))) {
        note(
          "info",
          rel,
          lineNo,
          "max-width query — the convention is mobile-first min-width. Acceptable only to undo a min-width rule in this file."
        );
      }
    }

    // --- fixed pixel widths ------------------------------------------------
    if (WIDTH_PROPS.test(line)) {
      for (const m of line.matchAll(/(\d{2,4})px/g)) {
        const px = Number(m[1]);
        // Small values are icons/thumbnails, not layout.
        if (px < 120) continue;
        if (/max-width/i.test(line)) continue; // a max-width cap is fine
        note(
          "warn",
          rel,
          lineNo,
          `fixed ${px}px in a width property. Fixed layout widths force horizontal scroll below that viewport — prefer minmax(), % or ch.`
        );
      }
    }

    // --- hardcoded offsets on pinned elements ------------------------------
    if (/^\s*(top|bottom)\s*:\s*\d+px/.test(line)) {
      const context = source.slice(Math.max(0, source.indexOf(line) - 400), source.indexOf(line) + 200);
      if (/position\s*:\s*(sticky|fixed)/.test(context)) {
        note(
          "error",
          rel,
          lineNo,
          "hardcoded px offset on a sticky/fixed element. This breaks at the 12-24px accessibility font scale — use var(--header-total) or var(--bottom-inset)."
        );
      }
    }

    // --- bare z-index ------------------------------------------------------
    const z = line.match(/^\s*z-index\s*:\s*(\d+)/);
    if (z) {
      note(
        "warn",
        rel,
        lineNo,
        `bare z-index: ${z[1]}. Use the named scale (--z-sticky-bar/-header/-fab/-alert/-toast) so stacking stays coherent.`
      );
    }
  });
}

// ---------------------------------------------------------------------------
// TSX: fixed canvas dimensions and inline pixel widths
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
    if (/<canvas[^>]*\swidth=\{?\d+/.test(line)) {
      note(
        "error",
        rel,
        i + 1,
        "fixed <canvas width>. Size the canvas from its container instead; a fixed width forces the page wider than a 320px viewport."
      );
    }
    const inlineWidth = line.match(/\bwidth:\s*(\d{3,4})\b/);
    if (inlineWidth && Number(inlineWidth[1]) >= 200) {
      note(
        "warn",
        rel,
        i + 1,
        `inline width: ${inlineWidth[1]}px. Prefer a class and a relative unit.`
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Breakpoint coverage summary
// ---------------------------------------------------------------------------

const responsivePath = path.join(STYLES, BREAKPOINT_OWNER);
const queryCount = fs.existsSync(responsivePath)
  ? [...fs.readFileSync(responsivePath, "utf8").matchAll(/@media[^{]*\b(?:min|max)-width\b/g)].length
  : 0;

const errors = findings.filter((f) => f.level === "error");
const warns = findings.filter((f) => f.level === "warn");
const infos = findings.filter((f) => f.level === "info");

console.log(`\naudit-responsive: ${queryCount} width media queries in ${BREAKPOINT_OWNER}\n`);

if (!findings.length) {
  console.log("  Clean.\n");
  process.exit(0);
}

for (const level of ["error", "warn", "info"]) {
  const group = findings.filter((f) => f.level === level);
  if (!group.length) continue;
  console.log(`  ${level.toUpperCase()} (${group.length}):`);
  for (const f of group) {
    console.log(`    ${f.file}:${f.line}`);
    console.log(`      ${f.message}`);
  }
  console.log("");
}

console.log(`  ${errors.length} error(s), ${warns.length} warning(s), ${infos.length} note(s)\n`);
process.exit(errors.length ? 1 : 0);

#!/usr/bin/env node
/**
 * IncluMarket interactive-control inventory.
 *
 * Turns "verify every button works" from an unbounded job into a finite
 * checklist, and finds the two failure modes you cannot see by clicking around:
 *
 *   ORPHAN ACTIONS  — a server action exported but called by nothing. Either
 *                     dead code, or a feature whose UI was never built.
 *   DEAD CONTROLS   — a <button> with no onClick and no type="submit", or a
 *                     handler whose body is empty or only a TODO.
 *
 * Zero dependencies. Run:
 *   node .claude/skills/inclumarket-feature-review/scripts/inventory.mjs
 *   node .claude/skills/inclumarket-feature-review/scripts/inventory.mjs --json
 *
 * Exit 0 = no dead controls or orphan actions, 1 = findings.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const APP = path.join(ROOT, "app");
const COMPONENTS = path.join(ROOT, "components");
const ACTIONS = path.join(ROOT, "lib", "actions");
const asJson = process.argv.includes("--json");

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/");

const BLOCK_COMMENT_RE = new RegExp("/\\*[\\s\\S]*?\\*/", "g");
const LINE_COMMENT_RE = new RegExp("^\\s*//.*$", "gm");
const NON_NEWLINE_RE = new RegExp("[^\\n]", "g");

/**
 * Blank out comments while preserving byte offsets and line numbers, so that
 * prose describing markup is not mistaken for the markup.
 */
function blankComments(source) {
  return source
    .replace(BLOCK_COMMENT_RE, (m) => m.replace(NON_NEWLINE_RE, " "))
    .replace(LINE_COMMENT_RE, (m) => m.replace(NON_NEWLINE_RE, " "));
}

/**
 * Read a JSX tag's attribute text, starting just after the tag name and
 * stopping at the ">" that closes the tag. Tracks braces and quotes so a ">"
 * inside an arrow function or a string does not end the tag early.
 */
function readTagAttributes(source, from) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return source.slice(from, i);
  }
  return null;
}

function walk(dir, filter, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(p, filter, out);
    } else if (filter(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const routes = [];
for (const file of walk(APP, (n) => n === "page.tsx" || n === "route.ts")) {
  const source = fs.readFileSync(file, "utf8");
  const segment = path
    .relative(APP, path.dirname(file))
    .replace(/\\/g, "/")
    .replace(/\((\w+)\)\//g, "");
  const url = "/" + (segment === "" ? "" : segment);

  const guard = source.match(/requireRole\(\s*\[([^\]]*)\]/);
  const usesSession = source.includes("getSession(");

  routes.push({
    url: url === "/" ? "/" : url.replace(/\/$/, ""),
    file: rel(file),
    kind: path.basename(file) === "route.ts" ? "handler" : "page",
    guard: guard ? guard[1].replace(/["'\s]/g, "") : usesSession ? "session-optional" : "public",
  });
}
routes.sort((a, b) => a.url.localeCompare(b.url));

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

const actions = [];
if (fs.existsSync(ACTIONS)) {
  for (const file of fs.readdirSync(ACTIONS).filter((f) => f.endsWith(".ts"))) {
    const source = fs.readFileSync(path.join(ACTIONS, file), "utf8");
    if (!/^\s*["']use server["']/m.test(source)) continue;
    for (const m of source.matchAll(/export\s+async\s+function\s+(\w+)/g)) {
      actions.push({
        name: m[1],
        module: `lib/actions/${file}`,
        callers: [],
        serverCallers: [],
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Controls, per client/page file
// ---------------------------------------------------------------------------

const controls = [];
const deadControls = [];

const uiFiles = [
  ...walk(APP, (n) => n.endsWith(".tsx")),
  ...walk(COMPONENTS, (n) => n.endsWith(".tsx")),
];

for (const file of uiFiles) {
  const source = fs.readFileSync(file, "utf8");
  const r = rel(file);
  const lines = source.split("\n");

  // Which actions does this file call?
  for (const action of actions) {
    const called =
      new RegExp(`\\b${action.name}\\s*\\(`).test(source) &&
      !source.includes(`export async function ${action.name}`);
    if (called) action.callers.push(r);
  }

  let buttons = 0;
  let links = 0;
  let forms = 0;
  let handlers = 0;

  lines.forEach((line, i) => {
    const lineNo = i + 1;

    if (/<button\b/.test(line)) buttons++;
    if (/<Link\b/.test(line)) links++;
    if (/<form\b/.test(line)) forms++;
    if (/\bon(Click|Submit|Change)=/.test(line)) handlers++;

    // Empty or placeholder handler.
    const empty = line.match(/\bon(Click|Submit)=\{\s*\(\s*\)\s*=>\s*\{?\s*\}?\s*\}/);
    if (empty) {
      deadControls.push({
        file: r,
        line: lineNo,
        reason: `on${empty[1]} handler is empty — the control does nothing.`,
      });
    }
    if (/\bon(Click|Submit)=\{[^}]*(TODO|FIXME|not implemented)/i.test(line)) {
      deadControls.push({ file: r, line: lineNo, reason: "handler is a TODO placeholder." });
    }
  });

  // <button> with neither a handler nor a submit type, across the whole file.
  //
  // A naive /<button\b([^>]*)>/ is wrong here: an arrow function in an
  // attribute (onClick={() => ...}) contains a ">", so the match truncates
  // before the real attributes and every such button looks dead. Scan for the
  // ">" at brace depth zero instead.
  // Comments are blanked first (preserving offsets): a JSX comment that
  // *discusses* <button> markup is not a control.
  const scannable = blankComments(source);

  for (const m of scannable.matchAll(/<button\b/g)) {
    const attrs = readTagAttributes(scannable, m.index + "<button".length);
    if (attrs === null) continue;
    if (/on(Click|Submit)=/.test(attrs)) continue;
    if (/type=["']submit["']/.test(attrs)) continue;
    if (/formAction=/.test(attrs)) continue;
    const lineNo = source.slice(0, m.index).split("\n").length;
    deadControls.push({
      file: r,
      line: lineNo,
      reason: "<button> has no onClick, no type=\"submit\" and no formAction — it does nothing when pressed.",
    });
  }

  if (buttons || links || forms) {
    controls.push({ file: r, buttons, links, forms, handlers });
  }
}

// Actions are also called from other server modules — shop.ts calls
// clearCartAction, pages call redirectHomeForSession. Those are not UI gaps, so
// they are reported separately from true orphans.
const serverFiles = walk(path.join(ROOT, "lib"), (n) => n.endsWith(".ts"));
for (const file of serverFiles) {
  const source = fs.readFileSync(file, "utf8");
  const r = rel(file);
  for (const action of actions) {
    if (action.module === r) continue;
    if (new RegExp(`\\b${action.name}\\s*\\(`).test(source)) action.serverCallers.push(r);
  }
}

const orphanActions = actions.filter(
  (a) => a.callers.length === 0 && a.serverCallers.length === 0
);
const serverOnlyActions = actions.filter(
  (a) => a.callers.length === 0 && a.serverCallers.length > 0
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (asJson) {
  console.log(
    JSON.stringify(
      { routes, actions, controls, deadControls, orphanActions, serverOnlyActions },
      null,
      2
    )
  );
  process.exit(deadControls.length || orphanActions.length ? 1 : 0);
}

const totals = controls.reduce(
  (acc, c) => ({
    buttons: acc.buttons + c.buttons,
    links: acc.links + c.links,
    forms: acc.forms + c.forms,
  }),
  { buttons: 0, links: 0, forms: 0 }
);

console.log("\n=== IncluMarket interactive inventory ===\n");
console.log(
  `  ${routes.length} routes, ${actions.length} server actions, ` +
    `${totals.buttons} buttons, ${totals.links} links, ${totals.forms} forms\n`
);

console.log("  Routes and guards:");
for (const r of routes) {
  console.log(`    ${r.url.padEnd(28)} ${r.guard.padEnd(18)} ${r.file}`);
}

if (serverOnlyActions.length) {
  console.log("\n  Called only from server code (not a UI gap — but every export");
  console.log("  of a \"use server\" module is still a public endpoint):");
  for (const a of serverOnlyActions) {
    console.log(`    ${a.module} → ${a.name}()  <- ${a.serverCallers.join(", ")}`);
  }
}

console.log("\n  Orphan server actions (exported, called by nothing at all):");
if (!orphanActions.length) {
  console.log("    none");
} else {
  for (const a of orphanActions) {
    console.log(`    ${a.module} → ${a.name}()`);
  }
  console.log(
    "\n    Each is either dead code or a feature with no UI. Both are worth\n" +
      "    resolving before a demo: the second means the spec claims something\n" +
      "    the app cannot do."
  );
}

console.log("\n  Dead controls:");
if (!deadControls.length) {
  console.log("    none");
} else {
  for (const d of deadControls) {
    console.log(`    ${d.file}:${d.line}`);
    console.log(`      ${d.reason}`);
  }
}

console.log("");
process.exit(deadControls.length || orphanActions.length ? 1 : 0);

#!/usr/bin/env node
/**
 * check-page-props — what a page hands to the browser.
 *
 * Next.js serialises EVERY prop passed to a Client Component into the page
 * payload, whether or not the component renders it. That is how /seller/orders
 * and /seller/reviews shipped every user's raw email to any seller (B-13), and
 * how /home shipped full Profile rows to guests (fixed in Phase 16). The
 * audit-actions script cannot see this class of bug: it reads actions, not
 * page props.
 *
 * Rules, for every app/**\/page.tsx outside app/admin/:
 *   1. It must not import an UNSCOPED reader from @/lib/data — one that
 *      returns a whole table. Use the scoped readers (getDisplayNames,
 *      getOrderItemsForOrders, getReviewsForProducts, ...).
 *   2. It must not build an object with, or read, a sensitive field:
 *      email, phone, disability_type, assistive_needs, pwd_id_url,
 *      id_number*. (Shipping fields an order's own seller needs are named
 *      shipping_* and are not matched.)
 *   3. No file outside app/admin/ may import an admin-only module
 *      (lib/admin-analytics.ts, lib/admin-overview.ts): they count and name
 *      across every user. Their readers check the admin role themselves,
 *      but getAdminOverview()'s health counts start beside that check, and
 *      a component, layout or "use server" module that imports them is one
 *      careless call from showing them to anyone. This rule reads every
 *      .ts/.tsx file under app/ (outside app/admin/), components/ and lib/
 *      (except the two modules), and middleware.ts, not only pages.
 *
 * A line can opt out with a trailing `// props-ok: <reason>`, or in JSX a
 * block comment starting `props-ok: <reason>`. The reason is printed, so
 * every exception is visible in review.
 *
 * Exit 1 on any finding. Run by `npm run verify`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const APP = join(ROOT, "app");

const UNSCOPED = [
  "getProfiles",
  "getAllProducts",
  "getOrders",
  "getOrderItems",
  "getReviews",
  "getVariants",
  "getTicketResponses",
  "getTickets",
  "getConsentLogs",
  "getAuditLogs",
];

const FIELD = "(?:email|phone|disability_type|assistive_needs|pwd_id_url|id_number\\w*)";
const SENSITIVE = new RegExp(`(?:\\b${FIELD}\\s*:|\\.\\s*${FIELD}\\b)`);
const IMPORT_FROM_DATA = /import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/data["']/g;
// The alias or a relative path ("./admin-overview", "../../lib/admin-overview").
const ADMIN_ONLY = /from\s*["'](?:@\/lib\/|\.\.?\/(?:[\w.-]+\/)*)(admin-analytics|admin-overview)["']/;
const ADMIN_ONLY_SELF = new Set(["lib/admin-analytics.ts", "lib/admin-overview.ts"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === "page.tsx") out.push(p);
  }
  return out;
}

const findings = [];
const allowed = [];

for (const file of walk(APP)) {
  const rel = relative(ROOT, file).split(sep).join("/");
  if (rel.startsWith("app/admin/")) continue;
  const src = readFileSync(file, "utf8");

  // Rule 1 — imports from @/lib/data
  for (const m of src.matchAll(IMPORT_FROM_DATA)) {
    const names = m[1]
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/)[0])
      .filter(Boolean);
    for (const n of names) {
      if (UNSCOPED.includes(n)) {
        const line = src.slice(0, m.index).split(/\r?\n/).length;
        findings.push(`${rel}:${line}  imports unscoped reader ${n}() — use a scoped reader`);
      }
    }
  }

  // Rule 2 — sensitive fields
  src.split(/\r?\n/).forEach((text, i) => {
    const code = text.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    if (!SENSITIVE.test(code)) return;
    const ok = text.match(/(?:\/\/|\/\*)\s*props-ok:\s*(.+?)\s*(?:\*\/.*)?$/);
    if (ok) allowed.push(`${rel}:${i + 1}  ${ok[1].trim()}`);
    else findings.push(`${rel}:${i + 1}  sensitive field: ${text.trim()}`);
  });
}

// Rule 3 — admin-only modules, imported only under app/admin/. Every source
// file, not only pages: a layout or a component passes data on just the same.
function walkSource(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && !name.startsWith(".")) walkSource(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const sources = [...walkSource(APP), ...walkSource(join(ROOT, "components")), ...walkSource(join(ROOT, "lib"))];
const middleware = join(ROOT, "middleware.ts");
try {
  if (statSync(middleware).isFile()) sources.push(middleware);
} catch {
  // no middleware.ts
}
for (const file of sources) {
  const rel = relative(ROOT, file).split(sep).join("/");
  if (rel.startsWith("app/admin/") || ADMIN_ONLY_SELF.has(rel)) continue;
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((text, i) => {
      const m = text.match(ADMIN_ONLY);
      if (m) findings.push(`${rel}:${i + 1}  imports lib/${m[1]} — admin only; import it under app/admin/`);
    });
}

console.log("check-page-props: non-admin pages; admin-only imports in every file");
if (allowed.length) {
  console.log("\n  Allowed by an explicit props-ok comment:");
  for (const a of allowed) console.log("    " + a);
}
if (findings.length) {
  console.log("\n  FAIL:");
  for (const f of findings) console.log("    " + f);
  console.log(`\n  ${findings.length} finding(s).`);
  process.exit(1);
}
console.log("  Clean — no unscoped readers, no admin-only modules, no sensitive fields in page code.");

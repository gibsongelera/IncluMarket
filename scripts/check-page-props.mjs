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

console.log("check-page-props: non-admin pages");
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
console.log("  Clean — no unscoped readers, no sensitive fields in page code.");

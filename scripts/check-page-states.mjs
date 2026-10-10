#!/usr/bin/env node
/**
 * check-page-states — no blank pages.
 *
 * There was no not-found, error or loading file anywhere: a 404 was Next's
 * unstyled default, a thrown server error showed a bare page, and data pages
 * showed nothing while loading (B-18). This fails unless:
 *   - app/not-found.tsx, app/error.tsx and app/global-error.tsx exist
 *   - the Seller Centre and Admin shells have their own error.tsx, so a
 *     failing page keeps its sidebar
 *   - every data page in the shop, buyer, seller and admin areas has a
 *     loading.tsx in its folder or an ancestor below app/
 *
 * Deliberate exceptions (NO loading boundary):
 *   - the product page: a loading boundary makes Next stream the response,
 *     which fixes the status at 200 before notFound() can run, so a missing
 *     product would stop being a real 404 (N-15)
 *   - static content pages and /login, which render without slow reads
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep, dirname } from "node:path";

const ROOT = process.cwd();
const APP = join(ROOT, "app");
const findings = [];

for (const f of ["not-found.tsx", "error.tsx", "global-error.tsx"]) {
  if (!existsSync(join(APP, f))) findings.push(`app/${f} is missing`);
}
for (const shell of ["seller", "admin"]) {
  if (!existsSync(join(APP, shell, "error.tsx"))) findings.push(`app/${shell}/error.tsx is missing`);
}

const MUST_STAY_STATUS_EXACT = ["app/buyer/product/[id]/page.tsx"];
const NEEDS_LOADING = /^app\/(home|buyer|seller|admin|search|shop|account|notifications)(\/|$)/;

function pages(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) pages(p, out);
    else if (name === "page.tsx") out.push(p);
  }
  return out;
}

function loadingFor(page) {
  let dir = dirname(page);
  while (dir.startsWith(APP)) {
    if (existsSync(join(dir, "loading.tsx"))) return relative(ROOT, dir).split(sep).join("/");
    if (dir === APP) return null;
    dir = dirname(dir);
  }
  return null;
}

for (const page of pages(APP)) {
  const rel = relative(ROOT, page).split(sep).join("/");
  const covered = loadingFor(page);
  if (MUST_STAY_STATUS_EXACT.includes(rel)) {
    if (covered) findings.push(`${rel} is under ${covered}/loading.tsx — a missing product would answer 200, not 404`);
    continue;
  }
  if (NEEDS_LOADING.test(rel) && !covered) findings.push(`${rel} has no loading screen`);
}

console.log("check-page-states");
if (findings.length) {
  for (const f of findings) console.log("  " + f);
  process.exit(1);
}
console.log("  Clean — 404, error and loading states cover every data page; product 404s stay real.");

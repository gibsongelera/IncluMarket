#!/usr/bin/env node
/**
 * check-migrations — which migrations does the live database have?
 *
 * Read-only. For each migration from 0013 on, asks PostgREST (service role)
 * for one object that migration creates. Reports what is missing, so a deploy
 * of this branch can be checked against the database it will talk to.
 *
 *   node --env-file=.env.local scripts/check-migrations.mjs
 *
 * Apply missing migrations in order, in the Supabase SQL editor or with
 * `supabase db push`, BEFORE deploying code that needs them. Exit 1 when any
 * is missing.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function hasTable(name, column = "*") {
  const r = await fetch(`${URL_}/rest/v1/${name}?select=${column}&limit=0`, { headers: H });
  return r.ok;
}
async function hasRpc(name, body) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  // 404 / PGRST202 = function missing; any other answer means it exists.
  if (r.status !== 404) return true;
  const j = await r.json().catch(() => ({}));
  return j.code !== "PGRST202";
}

const CHECKS = [
  ["0013_surface_b_lockdown", () => hasRpc("im_can_see_order", { p_order_id: 0 })],
  ["0014_order_state_machine", () => hasTable("im_settings")],
  ["0015_checkouts_order_split", () => hasTable("im_checkouts")],
  ["0016_products_moderation_search", () => hasTable("im_storefront_products", "id")],
  ["0017_pwd_verification", () => hasTable("im_pwd_verifications")],
  ["0018_pwd_discount_rules", () => hasTable("im_discount_rules")],
  ["0019_buyer_seller_support", () => hasTable("im_addresses")],
  ["0020_earnings_payouts_categories", () => hasTable("im_seller_earnings", "order_id")],
];

let missing = 0;
console.log(`Database: ${URL_.replace(/^https:\/\/([a-z0-9]{4})[a-z0-9]*/, "https://$1…")}`);
for (const [name, test] of CHECKS) {
  let ok = false;
  try {
    ok = await test();
  } catch {
    ok = false;
  }
  console.log(`  ${ok ? "✔ applied" : "✖ MISSING"}  ${name}.sql`);
  if (!ok) missing++;
}
console.log(missing ? `\n${missing} migration(s) missing. Apply them in order before deploying.` : "\nAll migrations present.");
process.exit(missing ? 1 : 0);

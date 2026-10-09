#!/usr/bin/env node
/**
 * probe-surface-b — attack the database the way a browser can.
 *
 * Uses ONLY the publishable key that ships in the browser bundle, plus the
 * JWTs of two test accounts, against PostgREST directly ("Surface B" in the
 * inclumarket-security-audit skill). Every write below must be refused once
 * migration 0013 is applied; the reads must still work.
 *
 * Run against a DEV project only:
 *
 *   PROBE_TARGET=dev \
 *   PROBE_BUYER_EMAIL=... PROBE_BUYER_PASSWORD=... \
 *   PROBE_SELLER_EMAIL=... PROBE_SELLER_PASSWORD=... \
 *   node --env-file=.env.local scripts/probe-surface-b.mjs
 *
 * It refuses to run without PROBE_TARGET=dev, because before 0013 some of
 * these writes SUCCEED — pointed at production, it would mark real orders
 * paid. Each attempted write targets only the test accounts' own rows.
 *
 * Exit 1 when any write gets through or any read breaks.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (process.env.PROBE_TARGET !== "dev") {
  console.error("Refusing to run: set PROBE_TARGET=dev and point .env at a DEV project.");
  process.exit(2);
}
if (!URL_ || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  process.exit(2);
}

async function signIn(email, password) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`sign-in failed for ${email}: ${j.error_description || r.status}`);
  return j.access_token;
}

async function rest(method, path, { jwt, body } = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${jwt || KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await r.json();
  } catch {
    /* empty body */
  }
  return { status: r.status, data };
}

/** A write is refused when PostgREST errors, or when it touched zero rows. */
function refused(res) {
  return res.status >= 400 || (Array.isArray(res.data) && res.data.length === 0);
}

let fails = 0;
function report(name, ok, res) {
  console.log(`  ${ok ? "✔" : "✖"} ${name}${ok ? "" : `  (HTTP ${res?.status} ${JSON.stringify(res?.data)?.slice(0, 160)})`}`);
  if (!ok) fails++;
}

const buyer = await signIn(process.env.PROBE_BUYER_EMAIL, process.env.PROBE_BUYER_PASSWORD);
const seller = await signIn(process.env.PROBE_SELLER_EMAIL, process.env.PROBE_SELLER_PASSWORD);

console.log("Surface B probe — writes (all must be refused)");
let r = await rest("PATCH", "im_orders", { jwt: buyer, body: { payment_status: "paid" } });
report("buyer: unfiltered PATCH of own orders' payment_status", refused(r), r);
r = await rest("PATCH", "im_order_items", { jwt: buyer, body: { unit_price: 1 } });
report("buyer: rewrite own order line prices", refused(r), r);
r = await rest("PATCH", "im_products", { jwt: seller, body: { status: "approved", is_featured: true } });
report("seller: self-approve / self-feature listings", refused(r), r);
r = await rest("POST", "im_product_reviews", { jwt: buyer, body: { product_id: 1, buyer_id: 1, rating_score: 5 } });
report("buyer: insert a review directly", refused(r), r);
r = await rest("POST", "im_payouts", { jwt: seller, body: { seller_id: 1, amount: 99999, method: "gcash", account_number: "0" } });
report("seller: insert a payout row", refused(r), r);
r = await rest("POST", "im_newsletter_subscribers", { body: { email: `probe-${Date.now()}@test.invalid` } });
report("anon: newsletter insert past the rate limit", refused(r), r);
r = await rest("POST", "im_cart_items", { jwt: buyer, body: { user_id: 1, product_id: 1, quantity: 1 } });
report("buyer: direct cart insert", refused(r), r);
r = await rest("PATCH", "im_profiles", { jwt: buyer, body: { role: "admin" } });
report("buyer: escalate own role (0009 regression)", refused(r), r);

console.log("\nSurface B probe — reads (must work, scoped)");
r = await rest("GET", "im_orders?select=id", { jwt: buyer });
report("buyer: read own orders (no RLS recursion)", r.status === 200, r);
r = await rest("GET", "im_profiles?select=id,email", { jwt: buyer });
report("buyer: profiles read returns only own row", r.status === 200 && Array.isArray(r.data) && r.data.length <= 1, r);
r = await rest("GET", "im_products?select=id,status&status=neq.approved");
report("anon: no non-approved products visible", r.status === 200 && Array.isArray(r.data) && r.data.length === 0, r);

console.log(fails ? `\n${fails} problem(s).` : "\nAll Surface B checks passed.");
process.exit(fails ? 1 : 0);

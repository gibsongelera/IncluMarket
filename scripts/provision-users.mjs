/**
 * Provision the demo InclusiveMarket accounts via the Supabase Auth Admin API.
 *
 * Usage (from repo root, with .env.local loaded):
 *   node --env-file=.env.local scripts/provision-users.mjs                 # all demo accounts
 *   node --env-file=.env.local scripts/provision-users.mjs --only-pwd-demo # just the four below
 *
 * PWD demo accounts (one of each case the verification rules distinguish):
 *   SEED_BUYER_NOPWD_EMAIL        buyer, no PWD verification   → pays full price
 *   SEED_BUYER_PWD_EMAIL          buyer, verified PWD          → sees PWD discounts where a rule is on
 *   SEED_SELLER_VERIFIED_EMAIL    seller, verified PWD         → listings can go live
 *   SEED_SELLER_UNVERIFIED_EMAIL  seller, not verified, no grace period → listings stay hidden
 * Verified ones get an approved "AVRC in person" verification with a demo ID
 * number in region "00", which no real PWD ID uses, so they can never block a
 * real person's ID. Needs PWD_ID_HASH_KEY — the same value as production — so
 * the duplicate check matches.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL and
 * SEED_ACCOUNT_PASSWORD. Creates users with email_confirm: true so they can
 * sign in immediately. Matching im_profiles rows come from the
 * im_handle_new_auth_user trigger (or are upserted here as a fallback).
 *
 * Credentials are read from the environment, never hardcoded. This file and
 * the README previously shipped six working accounts that all shared the
 * password "Admin123", including an admin — against a live deployment.
 */

import { createClient } from "@supabase/supabase-js";
import { createHash, createHmac } from "node:crypto";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env.local and set it.`);
    process.exit(1);
  }
  return value;
}

const PASSWORD = requireEnv("SEED_ACCOUNT_PASSWORD");

if (PASSWORD.length < 12) {
  console.error("SEED_ACCOUNT_PASSWORD must be at least 12 characters.");
  process.exit(1);
}
if (/^admin123$/i.test(PASSWORD)) {
  console.error("SEED_ACCOUNT_PASSWORD is the old published demo password. Choose another.");
  process.exit(1);
}

// Interlock: refuse to seed anything that is not obviously a local or preview
// target unless the operator opts in explicitly.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(siteUrl);
if (!isLocal && process.env.ALLOW_SEED_IN_PROD !== "1") {
  console.error(
    `Refusing to seed demo accounts against ${siteUrl || "an unknown site URL"}.
` +
      "Set ALLOW_SEED_IN_PROD=1 if you really intend to do this."
  );
  process.exit(1);
}

const email = (name, fallback) => process.env[name] || fallback;

const USERS = [
  { email: email("SEED_BUYER_EMAIL", "buyer@example.test"), password: PASSWORD, role: "buyer", name: "Buyer Account" },
  { email: email("SEED_SELLER_EMAIL", "seller@example.test"), password: PASSWORD, role: "seller", name: "Seller Account" },
  { email: email("SEED_ADMIN_EMAIL", "admin@example.test"), password: PASSWORD, role: "admin", name: "Admin Account" },
  {
    email: email("SEED_SELLER2_EMAIL", "seller2@example.test"),
    password: PASSWORD,
    role: "seller",
    name: "Maria Santos",
    featured: true,
    story:
      "Maria weaves bags and home textiles using a foot-pedal loom adapted for her limited hand mobility. " +
      "What started as physical therapy after an accident became a full-time livelihood — every piece is " +
      "handwoven in her home workshop in Laguna and sold directly through InclusiveMarket.",
  },
  {
    email: email("SEED_SELLER3_EMAIL", "seller3@example.test"),
    password: PASSWORD,
    role: "seller",
    name: "Juno Reyes",
    featured: true,
    story:
      "Juno is a Deaf graphic designer and tailor who runs an adaptive-apparel line — magnetic closures, " +
      "one-handed zippers, seated-fit cuts — designed from lived experience, not guesswork. Orders are " +
      "confirmed entirely through in-app messaging so no phone call is ever required.",
  },
];

// PWD demo accounts. `pwdId` set = verified; `noGrace` = a seller who may not
// sell until verified.
const PWD_DEMO = [
  { email: email("SEED_BUYER_NOPWD_EMAIL", "buyer.nopwd@example.test"), password: PASSWORD, role: "buyer", name: "Ana Cruz" },
  {
    email: email("SEED_BUYER_PWD_EMAIL", "buyer.pwd@example.test"),
    password: PASSWORD,
    role: "buyer",
    name: "Ben Lim",
    pwdId: "00-0000-000-0000001",
  },
  {
    email: email("SEED_SELLER_VERIFIED_EMAIL", "seller.verified@example.test"),
    password: PASSWORD,
    role: "seller",
    name: "Carla Dizon",
    pwdId: "00-0000-000-0000002",
  },
  {
    email: email("SEED_SELLER_UNVERIFIED_EMAIL", "seller.unverified@example.test"),
    password: PASSWORD,
    role: "seller",
    name: "Dino Ramos",
    noGrace: true,
  },
];
const onlyPwdDemo = process.argv.includes("--only-pwd-demo");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(email) {
  // Paginate lightly — production expects few users.
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function ensureProfile(authUserId, { email, role, name, featured, story }) {
  const featuredFields = {
    ...(featured !== undefined ? { is_featured_seller: featured } : {}),
    ...(story !== undefined ? { seller_story: story } : {}),
  };

  const { data: existing } = await admin
    .from("im_profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("im_profiles")
      .update({
        auth_user_id: authUserId,
        role,
        name,
        updated_at: new Date().toISOString(),
        ...featuredFields,
      })
      .eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await admin
    .from("im_profiles")
    .insert({ auth_user_id: authUserId, email: email.toLowerCase(), role, name, ...featuredFields })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function provisionOne(user) {
  const existing = await findUserByEmail(user.email);
  let authUserId;

  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password: user.password,
      email_confirm: true,
      user_metadata: { name: user.name, role: user.role },
    });
    if (error) throw error;
    authUserId = data.user.id;
    console.log(`updated auth user: ${user.email} (${user.role})`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { name: user.name, role: user.role },
    });
    if (error) throw error;
    authUserId = data.user.id;
    console.log(`created auth user: ${user.email} (${user.role})`);
  }

  // Give the trigger a moment, then ensure profile exists with the correct role.
  await new Promise((r) => setTimeout(r, 400));
  const profileId = await ensureProfile(authUserId, user);
  console.log(`  profile id=${profileId}`);
  return profileId;
}

/** Same derivation as lib/pwd/crypto.ts: SHA-256 of the trimmed key, then HMAC. */
function hashPwdId(normalized) {
  const raw = process.env.PWD_ID_HASH_KEY?.trim();
  if (!raw || raw.length < 16) return null;
  const key = createHash("sha256").update(raw).digest();
  return createHmac("sha256", key).update(normalized).digest("hex");
}

/** Today + years, as a YYYY-MM-DD date in the Philippines. */
function manilaDatePlusYears(years) {
  const d = new Date(Date.now() + 8 * 3_600_000);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

async function seedVerification(profileId, user, reviewerId) {
  const { data: current, error: viewErr } = await admin
    .from("im_verified_pwd")
    .select("profile_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (viewErr) throw new Error(`im_verified_pwd: ${viewErr.message} (apply migration 0017 first)`);
  if (current) {
    console.log("  already verified");
    return;
  }
  const hash = hashPwdId(user.pwdId);
  if (!hash) throw new Error("PWD_ID_HASH_KEY is not set (use the same value as production).");
  const now = new Date().toISOString();
  const { data: row, error } = await admin
    .from("im_pwd_verifications")
    .insert({
      profile_id: profileId,
      method: "avrc_in_person",
      id_number_hash: hash,
      id_number_last4: user.pwdId.replace(/\D/g, "").slice(-4),
      issuing_lgu: "Demo account (not a real PWD ID)",
      expires_on: manilaDatePlusYears(2),
      status: "approved",
      registry_result: "not_checked",
      registry_check_note: "Seeded demo account by scripts/provision-users.mjs. Not a real PWD ID.",
      reviewer_id: reviewerId,
      reviewed_at: now,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error(`demo ID ${user.pwdId} is already approved on another account`);
    throw error;
  }
  await admin.from("im_audit_logs").insert({
    actor_id: null,
    actor_role: "system",
    action: "pwd_verification_seeded",
    target: `verification:${row.id} profile:${profileId}`,
  });
  console.log(`  PWD verified (demo ID ending ${user.pwdId.slice(-4)}, verification id=${row.id})`);
}

async function main() {
  if (!onlyPwdDemo) {
    for (const user of USERS) {
      await provisionOne(user);
    }
  }

  // Any active admin signs off the seeded verifications.
  const { data: reviewer } = await admin
    .from("im_profiles")
    .select("id")
    .eq("role", "admin")
    .eq("account_status", "active")
    .order("id")
    .limit(1)
    .maybeSingle();

  for (const user of PWD_DEMO) {
    const profileId = await provisionOne(user);
    if (user.pwdId) await seedVerification(profileId, user, reviewer?.id ?? null);
    if (user.noGrace) {
      // No grace period: this seller cannot sell until verified.
      const { error } = await admin.from("im_profiles").update({ pwd_grace_until: null }).eq("id", profileId);
      if (error) throw error;
      console.log("  not verified, no grace period (listings stay hidden until verified)");
    }
  }
  console.log("Done. Rotate passwords before public deployment.");
}

main().catch((err) => {
  console.error(err);
  // exitCode, not exit(): exiting while sockets close aborts Node on Windows.
  process.exitCode = 1;
});

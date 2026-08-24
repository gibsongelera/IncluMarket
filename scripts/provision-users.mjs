/**
 * Provision the demo IncluMarket accounts via the Supabase Auth Admin API.
 *
 * Usage (from repo root, with .env.local loaded):
 *   node --env-file=.env.local scripts/provision-users.mjs
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
      "handwoven in her home workshop in Laguna and sold directly through IncluMarket.",
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
}

async function main() {
  for (const user of USERS) {
    await provisionOne(user);
  }
  console.log("Done. Rotate passwords before public deployment.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Provision the three production InkluMarket accounts via Supabase Auth Admin API.
 *
 * Usage (from repo root, with .env.local loaded):
 *   node --env-file=.env.local scripts/provision-users.mjs
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL.
 * Creates users with email_confirm: true so they can sign in immediately.
 * Matching im_profiles rows are created by the im_handle_new_auth_user trigger
 * (or upserted here as a fallback).
 *
 * Rotate these credentials before any public deployment.
 */

import { createClient } from "@supabase/supabase-js";

const USERS = [
  { email: "buyer@gmail.com", password: "Admin123", role: "buyer", name: "Buyer Account" },
  { email: "seller@gmail.com", password: "Admin123", role: "seller", name: "Seller Account" },
  { email: "admin@gmail.com", password: "Admin123", role: "admin", name: "Admin Account" },
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

async function ensureProfile(authUserId, { email, role, name }) {
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
      })
      .eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await admin
    .from("im_profiles")
    .insert({ auth_user_id: authUserId, email: email.toLowerCase(), role, name })
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

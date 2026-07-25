"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession, setSession } from "@/lib/session";
import type { Role } from "@/lib/types";

// NOTE (demo): this mirrors the original static demo's auth semantics — any
// non-empty password is accepted for a known seeded email. Real Supabase Auth
// clients are wired (lib/supabase/*) for a production upgrade path; see README.

export interface AuthResult {
  ok: boolean;
  error?: string;
  role?: Role;
  name?: string;
}

async function audit(actorId: number, role: string, action: string, target: string) {
  await createAdminClient()
    .from("im_audit_logs")
    .insert({ actor_id: actorId, actor_role: role, action, target });
}

export async function loginAction(email: string, password: string): Promise<AuthResult> {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return { ok: false, error: "Please enter your email." };
  if (!password) return { ok: false, error: "Please enter your password." };

  const { data: user } = await createAdminClient()
    .from("im_profiles")
    .select("*")
    .ilike("email", normalized)
    .maybeSingle();

  if (!user) {
    return { ok: false, error: "No account matches that email in the demo dataset." };
  }

  await setSession({
    user_id: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
  });
  await audit(user.id, user.role, "auth_login (simulated bcrypt verify)", `user:${user.id}`);
  return { ok: true, role: user.role, name: user.name };
}

export async function signupAction(
  name: string,
  email: string,
  password: string,
  role: Role,
  consent: boolean
): Promise<AuthResult> {
  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanName || !cleanEmail || !password)
    return { ok: false, error: "Please fill in all fields." };
  if (password.length < 8)
    return { ok: false, error: "Password must be at least 8 characters." };
  if (!consent)
    return { ok: false, error: "You must accept the Data Privacy notice to continue." };
  if (role !== "buyer" && role !== "seller")
    return { ok: false, error: "Please choose a valid role." };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("im_profiles")
    .select("id")
    .ilike("email", cleanEmail)
    .maybeSingle();
  if (existing)
    return { ok: false, error: "An account with that email already exists in the demo." };

  const { data: created, error } = await admin
    .from("im_profiles")
    .insert({ name: cleanName, email: cleanEmail, role })
    .select("*")
    .single();
  if (error || !created)
    return { ok: false, error: error?.message || "Could not create account." };

  await admin.from("im_consent_logs").insert({
    user_id: created.id,
    action: "account_created",
    consent: true,
    purpose: "RA 10173 DPA registration consent",
  });
  await audit(created.id, role, "account_created", `user:${created.id}`);

  await setSession({
    user_id: created.id,
    role: created.role,
    email: created.email,
    name: created.name,
  });
  return { ok: true, role: created.role, name: created.name };
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    await audit(session.user_id, session.role, "auth_logout", `user:${session.user_id}`);
  }
  await setSession(null);
  redirect("/");
}

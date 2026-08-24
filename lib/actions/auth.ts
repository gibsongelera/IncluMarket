"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession, homeForRole } from "@/lib/session";
import { guardByIp, rateLimit, RATE_LIMITED_MESSAGE } from "@/lib/security/rate-limit";
import type { Role } from "@/lib/types";

export interface AuthResult {
  ok: boolean;
  error?: string;
  role?: Role;
  name?: string;
  needsEmailConfirm?: boolean;
  message?: string;
}

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "http";
  const host = h.get("x-forwarded-host") || h.get("host");
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
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

  // Two buckets: per-IP stops a single host spraying many accounts, per-email
  // stops a distributed attempt against one account. Supabase applies its own
  // throttling, but nothing here did.
  const ipGuard = await guardByIp("login", { limit: 10, windowSeconds: 900 });
  if (ipGuard) return ipGuard;
  const byEmail = await rateLimit("login_email", `email:${normalized}`, {
    limit: 5,
    windowSeconds: 900,
  });
  if (!byEmail.ok) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalized,
    password,
  });

  if (error) {
    const msg = error.message || "Sign in failed.";
    if (/confirm|not confirmed|email not confirmed/i.test(msg)) {
      return {
        ok: false,
        error: "Please confirm your email first",
        needsEmailConfirm: true,
      };
    }
    if (/invalid login credentials/i.test(msg)) {
      return { ok: false, error: "Invalid email or password." };
    }
    return { ok: false, error: msg };
  }

  if (!data.user?.email_confirmed_at && !data.user?.confirmed_at) {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "Please confirm your email first",
      needsEmailConfirm: true,
    };
  }

  const session = await getSession();
  if (!session) {
    return { ok: false, error: "Account profile not found. Contact support." };
  }

  await audit(session.user_id, session.role, "auth_login", `user:${session.user_id}`);
  return { ok: true, role: session.role, name: session.name };
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

  const signupGuard = await guardByIp("signup", { limit: 5, windowSeconds: 3600 });
  if (signupGuard) return signupGuard;

  const origin = await siteOrigin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: { name: cleanName, role },
    },
  });

  if (error) {
    if (/already registered|already been registered/i.test(error.message)) {
      return { ok: false, error: "An account with that email already exists." };
    }
    return { ok: false, error: error.message };
  }

  // If email confirmations are disabled, a session may already exist.
  if (data.session) {
    const session = await getSession();
    if (session) {
      await createAdminClient().from("im_consent_logs").insert({
        user_id: session.user_id,
        action: "account_created",
        consent: true,
        purpose: "RA 10173 DPA registration consent",
      });
      await audit(session.user_id, role, "account_created", `user:${session.user_id}`);
      return { ok: true, role: session.role, name: session.name };
    }
  }

  return {
    ok: true,
    needsEmailConfirm: true,
    message: "Check your email to confirm your account before signing in.",
  };
}

export async function resendConfirmationAction(email: string): Promise<AuthResult> {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return { ok: false, error: "Please enter your email." };

  // Unauthenticated and it sends mail, so it is both an abuse vector and a way
  // to burn the project's email quota.
  const resend = await rateLimit("resend_confirm", `email:${normalized}`, {
    limit: 3,
    windowSeconds: 3600,
  });
  if (!resend.ok) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const origin = await siteOrigin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: normalized,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    message: "Confirmation email sent. Please check your inbox.",
  };
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    await audit(session.user_id, session.role, "auth_logout", `user:${session.user_id}`);
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function redirectHomeForSession(): Promise<string | null> {
  const session = await getSession();
  return session ? homeForRole(session.role) : null;
}

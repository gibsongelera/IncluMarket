"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { guardByIp, rateLimit, RATE_LIMITED_MESSAGE } from "@/lib/security/rate-limit";
import { clearRecoveryMarker, hasRecoveryMarker } from "@/lib/auth/recovery";
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

/**
 * Where the emailed link lands. app/auth/callback/route.ts matches on the
 * `next` value to tell a recovery from a signup confirmation, so the two must
 * agree — and this whole URL has to be allow-listed in Supabase Auth under
 * Redirect URLs, or Supabase silently substitutes the Site URL.
 */
const RESET_REDIRECT = "/auth/callback?next=/reset-password";

/** Minimum we will accept. Supabase enforces its own floor as well. */
const MIN_PASSWORD = 8;

/**
 * Start a password reset.
 *
 * ALWAYS reports success, whether or not the address has an account. Saying
 * "no account with that email" turns this into an account-enumeration oracle
 * — and on a marketplace where every seller is a person with a disability,
 * confirming that a given person has an account here is itself a disclosure.
 *
 * The link Supabase sends lands on /auth/callback, which exchanges the code
 * for a session and forwards to /reset-password.
 */
export async function requestPasswordResetAction(email: string): Promise<AuthResult> {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    return { ok: false, error: "Please enter your email address." };
  }

  // Unauthenticated and it sends mail, so it is both an abuse vector and a way
  // to burn the email quota. Limited per address and per IP.
  const perEmail = await rateLimit("password_reset", `email:${normalized}`, {
    limit: 3,
    windowSeconds: 3600,
  });
  const ipGuard = await guardByIp("password_reset_ip", { limit: 10, windowSeconds: 3600 });

  // Note the ordering: the generic success message is returned even when
  // rate-limited, so timing and wording cannot be used to probe for accounts.
  if (perEmail.ok && !ipGuard) {
    const supabase = await createSupabaseServerClient();
    // Deliberately NOT siteOrigin(): that trusts the request Host, and a reset
    // link built from an attacker-supplied Host is the classic password-reset
    // poisoning bug — the victim gets a real token pointing at the attacker.
    // The configured origin wins; the request host is only a dev fallback.
    const site = process.env.NEXT_PUBLIC_SITE_URL || (await siteOrigin());
    const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
      redirectTo: `${site}${RESET_REDIRECT}`,
    });
    if (error) {
      // Logged, not surfaced — the caller still sees the neutral message.
      //
      // Log the status and name too, not just the message. Supabase's mailer
      // failures arrive as AuthRetryableFetchError with an EMPTY message, so
      // logging error.message alone prints "{}" and tells you nothing about
      // the one failure mode that silences this whole feature.
      console.error(
        `[auth] password reset request failed: ${error.name} status=${error.status ?? "?"} ` +
          `message=${JSON.stringify(error.message)}` +
          (error.status === 500
            ? " — a 500 with an empty message is Supabase's auth mailer failing." +
              " Auth emails do NOT use EMAIL_PROVIDER; configure custom SMTP in" +
              " Supabase (Project Settings -> Authentication -> SMTP Settings)."
            : "")
      );
    }
  }

  return {
    ok: true,
    message:
      "If that email has an account, we have sent a reset link. It expires in one hour — check your spam folder if it does not arrive.",
  };
}

/**
 * Finish a password reset.
 *
 * Two conditions, both required:
 *
 *   1. a Supabase session — proves someone is signed in;
 *   2. the recovery marker set by /auth/callback — proves that session was
 *      created by following a link sent to the mailbox, moments ago.
 *
 * The second is the load-bearing one. updateUser({ password }) succeeds for any
 * session, and this function is a public HTTP endpoint like every other export
 * of a "use server" module, so without (2) an unattended signed-in browser is a
 * one-request account takeover.
 *
 * Nothing is accepted from the caller but the new password: no token, no user
 * id, no email.
 */
export async function updatePasswordAction(password: string): Promise<AuthResult> {
  const next = String(password || "");
  if (next.length < MIN_PASSWORD) {
    return { ok: false, error: `Please use at least ${MIN_PASSWORD} characters.` };
  }
  if (!/[a-zA-Z]/.test(next) || !/[0-9]/.test(next)) {
    return { ok: false, error: "Please include at least one letter and one number." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const expired = {
    ok: false as const,
    error: "This reset link has expired or was already used. Please request a new one.",
  };

  if (!user) return expired;
  if (!(await hasRecoveryMarker(user.id))) return expired;

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { ok: false, error: error.message };

  // One link, one change.
  await clearRecoveryMarker();

  const session = await getSession();
  if (session) await audit(session.user_id, session.role, "reset_password", `user:${session.user_id}`);

  return { ok: true, message: "Your password has been changed. You are now signed in." };
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


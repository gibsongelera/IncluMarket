"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { guardByIp, rateLimit, RATE_LIMITED_MESSAGE } from "@/lib/security/rate-limit";
import { clearRecoveryMarker, hasRecoveryMarker, setRecoveryMarker } from "@/lib/auth/recovery";
import { mintAndSendAuthEmail } from "@/lib/email/auth-mail";
import type { Role } from "@/lib/types";

function describeAuthError(
  error: { message?: string; status?: number; name?: string } | null | undefined,
  fallback: string
): string {
  const msg = (error?.message || "").trim();
  if (msg && msg !== "{}") return msg;
  if (error?.status === 500 || error?.name === "AuthRetryableFetchError") {
    return "We could not send the email. Please try again in a minute.";
  }
  return fallback;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  role?: Role;
  name?: string;
  needsEmailConfirm?: boolean;
  message?: string;
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
    const msg = describeAuthError(error, "Sign in failed.");
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

  // Mint the user + token without going through GoTrue's mailer, then send
  // via Resend (EMAIL_PROVIDER). signUp() used to fail here as "{}" when
  // Supabase could not deliver the confirmation email.
  const mailed = await mintAndSendAuthEmail({
    type: "signup",
    email: cleanEmail,
    password,
    data: { name: cleanName, role },
  });

  if (!mailed.ok) {
    return { ok: false, error: mailed.error || "Could not create account." };
  }

  if (mailed.userId) {
    const { data: profile } = await createAdminClient()
      .from("im_profiles")
      .select("id")
      .eq("auth_user_id", mailed.userId)
      .maybeSingle();
    if (profile) {
      await createAdminClient().from("im_consent_logs").insert({
        user_id: profile.id,
        action: "account_created",
        consent: true,
        purpose: "RA 10173 DPA registration consent",
      });
      await audit(profile.id, role, "account_created", `user:${profile.id}`);
    }
  }

  return {
    ok: true,
    needsEmailConfirm: true,
    message: "Check your email for a confirmation link and a code before signing in.",
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

  const mailed = await mintAndSendAuthEmail({ type: "magiclink", email: normalized });
  if (!mailed.ok) {
    return { ok: false, error: mailed.error || "Could not resend confirmation." };
  }
  return {
    ok: true,
    message: "Confirmation email sent. Please check your inbox.",
  };
}

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
 * The message is minted with generateLink and sent through EMAIL_PROVIDER
 * (Resend). The link lands on /auth/confirm, which works on any device.
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
    const mailed = await mintAndSendAuthEmail({ type: "recovery", email: normalized });
    if (!mailed.ok) {
      // Logged, not surfaced — the caller still sees the neutral message.
      console.error(`[auth] password reset mail failed: ${mailed.error ?? "unknown"}`);
    }
  }

  return {
    ok: true,
    message:
      "If that email has an account, we have sent a reset link. It expires in one hour — check your spam folder if it does not arrive.",
  };
}

/**
 * Redeem the numeric code from the recovery email.
 *
 * The alternative to clicking the link, and the better one here. A link is
 * redeemed by whichever browser opens it, which is rarely the browser that
 * asked: people request a reset on a laptop and read mail on a phone. The PKCE
 * link then fails outright, and the non-PKCE one strands a live session token
 * in a URL fragment. A code has no such coupling — you carry six digits across
 * to whatever device you are already sitting at.
 *
 * The code is the email_otp from generateLink, included in the Resend
 * template. Its length is a Supabase setting, so non-digits are stripped and
 * whatever remains is sent as the token.
 *
 * Same neutral-response rule as the request step: a wrong code and an unknown
 * address must be indistinguishable, or this becomes the enumeration oracle
 * the request step refuses to be.
 */
export async function verifyPasswordResetCodeAction(
  email: string,
  code: string
): Promise<AuthResult> {
  const normalized = String(email || "").trim().toLowerCase();
  const token = String(code || "").replace(/\D/g, "");

  if (!normalized || !token) {
    return { ok: false, error: "Enter the code from your email." };
  }

  // A short numeric code is a small search space. Without a limiter it is
  // brute-forceable, and unlike the request step this one grants a session.
  const perEmail = await rateLimit("password_reset_verify", `email:${normalized}`, {
    limit: 8,
    windowSeconds: 900,
  });
  const ipGuard = await guardByIp("password_reset_verify_ip", { limit: 20, windowSeconds: 900 });
  if (!perEmail.ok || ipGuard) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: normalized,
    token,
    type: "recovery",
  });

  if (error || !data.user) {
    return { ok: false, error: "That code is not valid, or it has expired. Request a new one." };
  }

  // Same proof the link path mints, so updatePasswordAction cannot tell the
  // two entry points apart and needs no second code path.
  await setRecoveryMarker(data.user.id);

  return { ok: true, message: "Code accepted. Choose your new password." };
}

/**
 * Confirm a new account with the numeric code from the Resend email.
 *
 * Same idea as verifyPasswordResetCodeAction: the code is not tied to the
 * browser that requested it, unlike a PKCE link.
 */
export async function verifySignupCodeAction(
  email: string,
  code: string
): Promise<AuthResult> {
  const normalized = String(email || "").trim().toLowerCase();
  const token = String(code || "").replace(/\D/g, "");
  if (!normalized || !token) {
    return { ok: false, error: "Enter the code from your email." };
  }

  const perEmail = await rateLimit("signup_verify", `email:${normalized}`, {
    limit: 8,
    windowSeconds: 900,
  });
  const ipGuard = await guardByIp("signup_verify_ip", { limit: 20, windowSeconds: 900 });
  if (!perEmail.ok || ipGuard) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const supabase = await createSupabaseServerClient();
  const kinds = ["signup", "magiclink", "email"] as const;
  for (const type of kinds) {
    const { data, error } = await supabase.auth.verifyOtp({
      email: normalized,
      token,
      type,
    });
    if (error || !data.user) continue;

    const session = await getSession();
    if (!session) {
      return { ok: false, error: "Account profile not found. Contact support." };
    }

    await createAdminClient().from("im_consent_logs").insert({
      user_id: session.user_id,
      action: "email_confirmed",
      consent: true,
      purpose: "RA 10173 DPA registration consent",
    });
    await audit(session.user_id, session.role, "email_confirmed", `user:${session.user_id}`);
    return { ok: true, role: session.role, name: session.name };
  }

  return { ok: false, error: "That code is not valid, or it has expired. Request a new one." };
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


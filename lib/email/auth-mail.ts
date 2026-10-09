import "server-only";

import type { EmailOtpType } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { activeProvider, sendEmail } from "@/lib/email/send";

/**
 * Signup confirmation and password recovery — sent by US, via EMAIL_PROVIDER.
 *
 * Supabase Auth's own mailer is a separate path. It ignores RESEND_API_KEY,
 * fails as AuthRetryableFetchError with an empty message (the "{}" toast), and
 * is what used to run when signupAction called signUp() / resetPasswordForEmail().
 *
 * generateLink mints the token without sending. We then deliver through
 * lib/email/send.ts, same as order receipts. Auth emails and transactional
 * emails therefore share one provider, one sender, and one failure log.
 *
 * This module is server-only, not "use server": it must not be a public
 * HTTP endpoint. Callers in lib/actions/auth.ts already rate-limit.
 */

export type AuthMailType = "signup" | "recovery" | "magiclink";

export interface AuthMailResult {
  ok: boolean;
  error?: string;
  alreadyRegistered?: boolean;
  userCreated?: boolean;
  emailSent?: boolean;
  userId?: string;
}

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function describeLinkError(error: { message?: string; status?: number; name?: string }): string {
  const msg = (error.message || "").trim();
  if (msg && msg !== "{}") return msg;
  if (error.status === 500 || error.name === "AuthRetryableFetchError") {
    return "The email service is temporarily unavailable. Please try again in a minute.";
  }
  return "Something went wrong. Please try again.";
}

function deliveryFailureMessage(userCreated: boolean): string {
  const from = process.env.EMAIL_FROM || "";
  const prefix = userCreated
    ? "Your account was saved, but we could not send the confirmation email. "
    : "We could not send the email. ";

  if (from.endsWith("@resend.dev")) {
    return (
      prefix +
      "Resend has no verified domain, so it only delivers to the address that owns the Resend account. Check that inbox and spam, or verify a domain at resend.com/domains."
    );
  }
  if (activeProvider() === "none") {
    return prefix + "No email provider is configured.";
  }
  return prefix + "Please try Resend confirmation in a minute, and check spam.";
}

export async function mintAndSendAuthEmail(opts: {
  type: AuthMailType;
  email: string;
  password?: string;
  data?: { name?: string; role?: string };
}): Promise<AuthMailResult> {
  const admin = createAdminClient();
  const redirectTo = `${siteBase()}/auth/confirm`;

  const generated =
    opts.type === "signup"
      ? await admin.auth.admin.generateLink({
          type: "signup",
          email: opts.email,
          password: opts.password || "",
          options: {
            data: opts.data ?? {},
            redirectTo,
          },
        })
      : opts.type === "recovery"
        ? await admin.auth.admin.generateLink({
            type: "recovery",
            email: opts.email,
            options: { redirectTo },
          })
        : await admin.auth.admin.generateLink({
            type: "magiclink",
            email: opts.email,
            options: { redirectTo },
          });

  const { data, error } = generated;

  if (error) {
    const msg = (error.message || "").trim();
    if (/already registered|already been registered|already exists/i.test(msg)) {
      return {
        ok: false,
        alreadyRegistered: true,
        error: "An account with that email already exists. If you have not confirmed it yet, open Sign in and resend the confirmation email.",
      };
    }
    console.error(
      `[auth-mail] generateLink failed: ${error.name} status=${error.status ?? "?"} ` +
        `message=${JSON.stringify(error.message)}`
    );
    return { ok: false, error: describeLinkError(error) };
  }

  const props = data.properties;
  const hashed = props?.hashed_token;
  const otp = props?.email_otp || "";
  const vtype = (props?.verification_type || opts.type) as EmailOtpType;

  if (!hashed && !otp) {
    return { ok: false, error: "Could not prepare the confirmation email." };
  }

  const next = vtype === "recovery" ? "&next=/reset-password" : "";
  const confirmUrl = hashed
    ? `${siteBase()}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=${encodeURIComponent(vtype)}${next}`
    : `${siteBase()}/`;

  const kind = vtype === "recovery" ? "password_reset" : "signup_confirm";
  const sent = await sendEmail(kind, { email: opts.email, name: opts.data?.name }, {
    name: opts.data?.name || "",
    confirmUrl,
    code: otp,
  });

  const userCreated = opts.type === "signup";
  if (!sent) {
    return {
      ok: false,
      userCreated,
      emailSent: false,
      userId: data.user?.id,
      error: deliveryFailureMessage(userCreated),
    };
  }

  return {
    ok: true,
    userCreated,
    emailSent: true,
    userId: data.user?.id,
  };
}

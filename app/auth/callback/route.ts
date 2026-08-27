import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { homeForRole } from "@/lib/session";
import { recoveryCookie } from "@/lib/auth/recovery";
import type { Role } from "@/lib/types";

/**
 * Only allow same-origin, path-relative redirect targets.
 *
 * `next` used to be concatenated straight onto `origin`, so `?next=@evil.com`
 * produced `https://oursite.com@evil.com` — which URL-parses to host
 * `evil.com`. That turns our own email-confirmation link into a credential
 * phishing vector. `?next=//evil.com` and `?next=/\evil.com` are the same trick.
 *
 * Belt and braces: shape-check the string, then resolve it against the origin
 * and assert the origin survived.
 */
/** Where a recovery link lands. Must match the action that builds the URL. */
const RESET_PATH = "/reset-password";

function safeNext(next: string | null, origin: string): string | null {
  if (!next) return null;
  // Must start with exactly one slash, and contain no backslashes (which some
  // browsers normalise to forward slashes when resolving authority).
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  try {
    const resolved = new URL(next, origin);
    if (resolved.origin !== new URL(origin).origin) return null;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), origin);

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const admin = createAdminClient();
      const { data: profile } = await admin
        .from("im_profiles")
        .select("id, role, name")
        .eq("auth_user_id", data.user.id)
        .maybeSingle();

      if (profile) {
        // This one route handles two different emails: the signup confirmation
        // and the password-recovery link. Only the first is a consent event —
        // logging a recovery as "email_confirmed" would put a false consent
        // record in the RA 10173 trail, which is worse than logging nothing.
        //
        // The flow is read off the validated `next` value rather than a
        // separate query param, so there is nothing extra to spoof.
        const isRecovery = next === RESET_PATH;

        if (!isRecovery) {
          await admin.from("im_consent_logs").insert({
            user_id: profile.id,
            action: "email_confirmed",
            consent: true,
            purpose: "RA 10173 DPA registration consent",
          });
        } else {
          await admin.from("im_audit_logs").insert({
            actor_id: profile.id,
            actor_role: profile.role,
            action: "password_recovery_link_used",
            target: `user:${profile.id}`,
          });
        }

        const dest = next || homeForRole(profile.role as Role);
        const response = NextResponse.redirect(`${origin}${dest}`);

        // A Supabase session on its own only proves "signed in". This marker is
        // what proves "arrived via the emailed link", and it is the only thing
        // that authorises updatePasswordAction. Set on the response directly so
        // it is unambiguously attached to the redirect.
        if (isRecovery) {
          const c = recoveryCookie(data.user.id);
          response.cookies.set(c.name, c.value, c.options);
        }

        return response;
      }
      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_callback`);
}

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { homeForRole } from "@/lib/session";
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
        await admin.from("im_consent_logs").insert({
          user_id: profile.id,
          action: "email_confirmed",
          consent: true,
          purpose: "RA 10173 DPA registration consent",
        });
        const dest = next || homeForRole(profile.role as Role);
        return NextResponse.redirect(`${origin}${dest}`);
      }
      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_callback`);
}

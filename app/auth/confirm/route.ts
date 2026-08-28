import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { completeEmailLink, safeNext } from "@/lib/auth/email-link";

/**
 * Email links that work on a different device from the one that asked.
 *
 * The PKCE route (/auth/callback) cannot: its `code` is only redeemable with
 * the code_verifier cookie held by the browser that started the flow. Request
 * a reset on a laptop, tap the link on a phone, and the exchange fails —
 * measured, not assumed: a link with no verifier came back as an implicit-flow
 * hash, landed on /home, and left a live session token stranded in the URL
 * fragment where nothing server-side could ever see it.
 *
 * `token_hash` carries its own proof, so any browser can redeem it. That is
 * what an email link has to do.
 *
 * Point the Supabase templates here:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"), origin);

  if (tokenHash && type) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error && data.user) {
      return completeEmailLink(data.user, next, origin);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_callback`);
}

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { completeEmailLink, safeNext } from "@/lib/auth/email-link";

/**
 * PKCE landing route: OAuth, and any email still built from the old template.
 *
 * Its `code` is only redeemable with the code_verifier cookie belonging to the
 * browser that STARTED the flow, so an email link routed here works only if
 * the recipient opens it on the same device. /auth/confirm is the one to point
 * email templates at — see lib/auth/email-link.ts.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), origin);

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      return completeEmailLink(data.user, next, origin);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_callback`);
}

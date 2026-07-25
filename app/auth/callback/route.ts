import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { homeForRole } from "@/lib/session";
import type { Role } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

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

import { StaticPageLayout } from "@/components/StaticPageLayout";
import { ResetPasswordClient } from "@/components/ResetPasswordClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasRecoveryMarker } from "@/lib/auth/recovery";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Choose a new password — IncluMarket",
};

/**
 * Landing page for the emailed recovery link.
 *
 * By the time this renders, /auth/callback has exchanged the recovery code for
 * a session and set the recovery marker. Both are required — a plain signed-in
 * session must not reach the form, or this page becomes a no-reauth password
 * change for anyone with access to an open browser.
 *
 * Rendering the form is only a hint; updatePasswordAction re-checks both.
 */
export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const recovering = Boolean(user) && (await hasRecoveryMarker(user!.id));

  return (
    <StaticPageLayout title="Choose a new password">
      <ResetPasswordClient hasSession={recovering} email={user?.email ?? null} />
    </StaticPageLayout>
  );
}

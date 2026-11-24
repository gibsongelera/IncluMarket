import { StaticPageLayout } from "@/components/StaticPageLayout";
import { ResetPasswordClient } from "@/components/ResetPasswordClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasRecoveryMarker } from "@/lib/auth/recovery";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Choose a new password",
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
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const recovering = Boolean(user) && (await hasRecoveryMarker(user!.id));
  // From an account set-up email (WELCOME_PATH): the first password, not a new one.
  const welcome = (await searchParams).welcome === "1";

  return (
    <StaticPageLayout title={welcome ? "Choose your password" : "Choose a new password"}>
      <ResetPasswordClient hasSession={recovering} email={user?.email ?? null} welcome={welcome} /> {/* props-ok: the signed-in user's own address */}
    </StaticPageLayout>
  );
}

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { siteUrl } from "@/lib/email/templates";
import { WELCOME_PATH } from "@/lib/auth/email-link";

/**
 * The email that lets someone whose account an administrator made choose
 * their first password: a PWD seller AVRC staff set up, or an invited user.
 *
 * Supabase's own invite email cannot do this here. Its link comes back as an
 * implicit-flow hash on /home, where nothing on the server can read it (see
 * app/auth/confirm), so the person could never get to a password form. Here
 * the app asks Supabase for the link's token instead (generateLink sends
 * nothing), builds a /auth/confirm link to the password form, and sends it in
 * its own template ("account_setup"). This is the same route and the same
 * recovery marker that a password reset uses.
 *
 * The link is a recovery link. It works once, for the project's email-link
 * lifetime (one hour). It goes to the mail provider and nowhere else: it is
 * not stored or logged. Returns whether the provider accepted the email.
 */
export async function emailSetPasswordLink(
  db: ReturnType<typeof createAdminClient>,
  to: { email: string; name: string },
  about: { seller: boolean; shopName?: string | null; verified?: boolean }
): Promise<boolean> {
  const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email: to.email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    console.error(`[set-password] no link: ${error?.message ?? "no token returned"}`);
    return false;
  }
  // The email's own base, so the button and every other link agree, and a
  // missing setting falls back to the live site rather than to localhost.
  const base = siteUrl().replace(/\/$/, "");
  const link =
    `${base}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}` +
    `&type=recovery&next=${encodeURIComponent(WELCOME_PATH)}`;
  return sendEmail("account_setup", to, {
    name: to.name,
    link,
    seller: about.seller,
    shopName: about.shopName ?? null,
    verified: about.verified === true,
  });
}

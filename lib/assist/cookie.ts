import "server-only";
import { cookies } from "next/headers";
import { ASSIST_SECONDS, readAssistToken, signAssist, type AssistGrant } from "./token";

/**
 * The cookie that puts an admin in a seller's Seller Centre (lib/assist).
 * Set only by startAssist, after its admin check; read by getSession(), which
 * honours it only for that admin's own sign-in, while they are still an
 * active admin and the seller is still an active seller.
 *
 * The service-role key signs it, as it signs the password-recovery marker:
 * it is always present on the server and never reaches the browser. Without
 * it nothing can be signed and assisting is off.
 */

const COOKIE = "im_assist";

function secret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export async function readAssistCookie(authUserId: string): Promise<AssistGrant | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return null;
  return readAssistToken(secret(), authUserId, value, Math.floor(Date.now() / 1000));
}

/** From a server action only: a render may not set cookies. */
export async function setAssistCookie(
  authUserId: string,
  adminId: number,
  sellerId: number
): Promise<AssistGrant | null> {
  const key = secret();
  if (!key) return null;
  const grant: AssistGrant = { adminId, sellerId, until: Math.floor(Date.now() / 1000) + ASSIST_SECONDS };
  (await cookies()).set(COOKIE, signAssist(key, authUserId, grant), {
    httpOnly: true,
    // Never sent on a link from another site, so nothing outside the app can
    // land an admin in a seller's shop.
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ASSIST_SECONDS,
  });
  return grant;
}

export async function clearAssistCookie(): Promise<void> {
  try {
    (await cookies()).delete(COOKIE);
  } catch {
    // Server Component render: nothing to clear from there, and it must not throw.
  }
}

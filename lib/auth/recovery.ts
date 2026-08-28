import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Marks a session as having arrived through a password-recovery link.
 *
 * Why this exists: `supabase.auth.updateUser({ password })` succeeds for ANY
 * valid session, and updatePasswordAction is an export of a "use server"
 * module — a public HTTP endpoint. Without this marker, anyone holding a
 * signed-in session (an unattended browser, a stolen cookie) could change the
 * password with no re-authentication and lock the owner out. Supabase's session
 * alone proves "someone is signed in", not "someone proved control of the
 * mailbox just now".
 *
 * The marker is set only by the auth callback, only on the recovery flow, and
 * is consumed on first successful use.
 */

const COOKIE = "im_pw_recovery";

/** Matches the lifetime of a Supabase recovery link. */
const MAX_AGE_SECONDS = 60 * 60;

/**
 * Bound to the auth user so a marker minted for one account cannot authorise a
 * password change on another, and signed so it cannot be forged by a network
 * attacker on a plaintext hop. The service-role key is used as the HMAC secret
 * because it is guaranteed present server-side and never reaches the browser.
 */
function sign(authUserId: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "inclumarket-dev-secret";
  return createHmac("sha256", secret).update(`pw-recovery:${authUserId}`).digest("hex");
}

function matches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The cookie the auth callback attaches to its redirect response. */
export function recoveryCookie(authUserId: string) {
  return {
    name: COOKIE,
    value: sign(authUserId),
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    },
  };
}

/**
 * Set the marker from a server action.
 *
 * The route handlers attach it to their redirect response instead; this is the
 * code-entry path, where there is no redirect to hang it on.
 */
export async function setRecoveryMarker(authUserId: string): Promise<void> {
  const c = recoveryCookie(authUserId);
  (await cookies()).set(c.name, c.value, c.options);
}

/** True when the current request carries a valid marker for this user. */
export async function hasRecoveryMarker(authUserId: string): Promise<boolean> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return false;
  return matches(value, sign(authUserId));
}

/** Consume the marker — a reset link authorises exactly one password change. */
export async function clearRecoveryMarker(): Promise<void> {
  try {
    (await cookies()).delete(COOKIE);
  } catch {
    // Server Component render: nothing to clear from there, and it must not throw.
  }
}

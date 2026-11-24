import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAssistCookie } from "@/lib/assist/cookie";
import type { Role, SessionUser } from "./types";

const CONTRAST_COOKIE = "im_contrast";

const HOME_BY_ROLE: Record<Role, string> = {
  buyer: "/home",
  seller: "/seller/dashboard",
  admin: "/admin",
};

export function homeForRole(role: Role): string {
  return HOME_BY_ROLE[role] || HOME_BY_ROLE.buyer;
}

export async function getSession(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("im_profiles")
    .select("id, role, email, name, auth_user_id, account_status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // A session is ONLY ever resolved through auth_user_id. There used to be an
  // email-based fallback here that back-filled auth_user_id onto any unlinked
  // profile matching the address — which meant anyone who signed up with the
  // email of an admin-created profile inherited that profile, role and all.
  // Linking an auth user to a pre-existing profile is a privileged operation
  // and now belongs to the admin tooling, never to a login.
  if (!profile) return null;

  // account_status has existed since migration 0007 and was never read, so a
  // suspended account signed in exactly like an active one. Suspension now
  // terminates the session (FR-12).
  if (profile.account_status === "suspended") return null;

  if (profile.role === "admin") {
    const assisted = await assistedSession(admin, user.id, profile);
    if (assisted) return assisted;
  }

  return {
    user_id: profile.id,
    role: profile.role as Role,
    email: profile.email,
    name: profile.name,
  };
}

/**
 * An admin working in a seller's Seller Centre (lib/actions/assist.ts) gets
 * the SELLER's session, with assistedBy naming the admin: every seller page
 * and action then works on the seller's own shop, so listings and sales stay
 * theirs, and admin pages and actions are closed until the admin stops.
 *
 * The cookie counts only for the sign-in it was signed for, only while the
 * admin is an active admin (checked above) and only while the seller is an
 * active seller; anything else is the admin's own session again.
 */
async function assistedSession(
  db: ReturnType<typeof createAdminClient>,
  authUserId: string,
  adminProfile: { id: number; name: string }
): Promise<SessionUser | null> {
  const grant = await readAssistCookie(authUserId);
  if (!grant || grant.adminId !== adminProfile.id) return null;
  const { data: seller } = await db
    .from("im_profiles")
    .select("id, role, email, name, account_status")
    .eq("id", grant.sellerId)
    .maybeSingle();
  if (!seller || seller.role !== "seller" || seller.account_status !== "active") return null;
  return {
    user_id: seller.id,
    role: "seller",
    email: seller.email,
    name: seller.name,
    assistedBy: {
      user_id: adminProfile.id,
      name: adminProfile.name,
      until: new Date(grant.until * 1000).toISOString(),
    },
  };
}

/**
 * True when the browser holds a valid sign-in for a SUSPENDED profile — the
 * window between an admin suspending someone and their session expiring.
 */
export async function isSignedInButSuspended(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await createAdminClient()
    .from("im_profiles")
    .select("account_status")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return data?.account_status === "suspended";
}

/**
 * getSession() memoised for one server render. The Seller Centre and Admin
 * layouts and the page inside them both need the session; without this every
 * page view made two Supabase Auth round trips. Server actions keep calling
 * getSession() directly — a sign-in or sign-out changes the answer mid-request.
 */
export const getRenderSession = cache(getSession);

export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const session = await getRenderSession();
  if (!session) {
    // A suspended user used to be bounced silently to the storefront (B-14);
    // they now get a page that says what happened and what to do.
    if (await isSignedInButSuspended()) redirect("/account-suspended");
    redirect("/login");
  }
  if (roles.length && !roles.includes(session.role)) {
    redirect(homeForRole(session.role));
  }
  return session;
}

export async function getContrast(): Promise<"default" | "high"> {
  const v = (await cookies()).get(CONTRAST_COOKIE)?.value;
  return v === "high" ? "high" : "default";
}

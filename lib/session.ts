import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role, SessionUser } from "./types";

const CONTRAST_COOKIE = "im_contrast";

const HOME_BY_ROLE: Record<Role, string> = {
  buyer: "/home",
  seller: "/seller/dashboard",
  admin: "/admin/users",
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

  return {
    user_id: profile.id,
    role: profile.role as Role,
    email: profile.email,
    name: profile.name,
  };
}

export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/");
  if (roles.length && !roles.includes(session.role)) {
    redirect(homeForRole(session.role));
  }
  return session;
}

export async function getContrast(): Promise<"default" | "high"> {
  const v = (await cookies()).get(CONTRAST_COOKIE)?.value;
  return v === "high" ? "high" : "default";
}

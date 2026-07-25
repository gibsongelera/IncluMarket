import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role, SessionUser } from "./types";

const CONTRAST_COOKIE = "im_contrast";

const HOME_BY_ROLE: Record<Role, string> = {
  buyer: "/buyer/home",
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
    .select("id, role, email, name, auth_user_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) {
    // Fallback: link by email if trigger lagged or profile was provisioned first.
    const { data: byEmail } = await admin
      .from("im_profiles")
      .select("id, role, email, name, auth_user_id")
      .ilike("email", user.email)
      .maybeSingle();
    if (!byEmail) return null;
    if (!byEmail.auth_user_id) {
      await admin
        .from("im_profiles")
        .update({ auth_user_id: user.id, updated_at: new Date().toISOString() })
        .eq("id", byEmail.id);
    }
    return {
      user_id: byEmail.id,
      role: byEmail.role as Role,
      email: byEmail.email,
      name: byEmail.name,
    };
  }

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

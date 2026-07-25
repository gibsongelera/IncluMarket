import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, SessionUser } from "./types";

const COOKIE = "im_session";
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
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as SessionUser;
  } catch {
    return null;
  }
}

export async function setSession(user: SessionUser | null): Promise<void> {
  const store = await cookies();
  if (!user) {
    store.delete(COOKIE);
    return;
  }
  const value = Buffer.from(JSON.stringify(user), "utf8").toString("base64");
  store.set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

// Redirects to login if unauthenticated, or to the user's own home if the role
// is not permitted — mirroring the original auth.require() guard.
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

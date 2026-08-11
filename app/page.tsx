import { redirect } from "next/navigation";
import { getSession, homeForRole } from "@/lib/session";

export const dynamic = "force-dynamic";

// The public storefront (with guest browsing) lives at /home; sign
// in / sign up lives at /login. This route just routes signed-in visitors
// to their dashboard and everyone else to the storefront.
export default async function RootPage() {
  const session = await getSession().catch(() => null);
  redirect(session ? homeForRole(session.role) : "/home");
}

import { requireRole } from "@/lib/session";
import { AdminUsersClient } from "@/components/AdminUsersClient";
import { getProfiles, getUserFootprints } from "@/lib/data";
import { verifiedAmongIfAvailable } from "@/lib/pwd/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

export default async function AdminUsersPage() {
  const session = await requireRole(["admin"]);
  const profiles = await getProfiles();
  const [footprints, verified] = await Promise.all([
    getUserFootprints(),
    verifiedAmongIfAvailable(profiles.map((p) => p.id)),
  ]);
  const empty = { products: 0, orders: 0, reviews: 0, tickets: 0, consents: 0 };
  const users = profiles.map((u) => ({
    ...u,
    footprint: footprints.get(u.id) ?? empty,
    // null: verification is not switched on yet (before migration 0017).
    verified: verified === null ? null : verified.has(u.id),
  }));

  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <AdminUsersClient users={users} currentAdminId={session.user_id} />
    </main>
  );
}

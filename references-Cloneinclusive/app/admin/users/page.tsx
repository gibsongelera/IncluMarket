import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AdminUsersClient } from "@/components/AdminUsersClient";
import {
  getConsentLogs,
  getOrders,
  getProfiles,
  getReviews,
  getTickets,
  getAllProducts,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await requireRole(["admin"]);
  const [profiles, products, orders, reviews, tickets, consents] = await Promise.all([
    getProfiles(),
    getAllProducts(),
    getOrders(),
    getReviews(),
    getTickets(),
    getConsentLogs(),
  ]);

  const footprint = (id: number) => ({
    products: products.filter((p) => p.seller_id === id).length,
    orders: orders.filter((o) => o.buyer_id === id).length,
    reviews: reviews.filter((r) => r.buyer_id === id).length,
    tickets: tickets.filter((t) => t.user_id === id).length,
    consents: consents.filter((c) => c.user_id === id).length,
  });

  const users = profiles.map((u) => ({ ...u, footprint: footprint(u.id) }));

  return (
    <>
      <SiteHeader variant="admin" active="users" session={session} />
      <main id="main" className="container main--admin">
        <AdminUsersClient users={users} currentAdminId={session.user_id} />
      </main>
      <SiteFooter />
    </>
  );
}

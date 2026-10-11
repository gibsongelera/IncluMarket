import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin → Overview (C-37): what needs an admin now, and a few health
 * numbers. Each count is independent and tolerant: a table that does not
 * exist yet (an unapplied migration) shows as unavailable, never as 0 and
 * never as an error page.
 */

export interface OverviewCount {
  key: string;
  label: string;
  count: number | null;
  href: string;
}

type Db = ReturnType<typeof createAdminClient>;
type Filter = (q: ReturnType<ReturnType<Db["from"]>["select"]>) => ReturnType<ReturnType<Db["from"]>["select"]>;

async function count(db: Db, table: string, filter: Filter = (q) => q): Promise<number | null> {
  const { count: n, error } = await filter(db.from(table).select("*", { count: "exact", head: true }));
  return error ? null : n ?? 0;
}

export async function getAdminOverview(): Promise<{ todo: OverviewCount[]; health: OverviewCount[] }> {
  const db = createAdminClient();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

  const [
    pendingProducts,
    verifications,
    flags,
    payouts,
    tickets,
    privacy,
    refunds,
    returns,
    contact,
    ordersWeek,
    newUsers,
    sellers,
    liveProducts,
  ] = await Promise.all([
    count(db, "im_products", (q) => q.eq("status", "pending")),
    count(db, "im_pwd_verifications", (q) => q.eq("status", "submitted")),
    count(db, "im_pwd_verification_flags", (q) => q.is("resolved_at", null)),
    count(db, "im_payouts", (q) => q.in("status", ["requested", "approved"])),
    count(db, "im_support_tickets", (q) => q.in("ticket_status", ["open", "in_progress"])),
    count(db, "im_privacy_requests", (q) => q.in("status", ["open", "in_progress"])),
    count(db, "im_orders", (q) => q.eq("refund_due", true)),
    count(db, "im_orders", (q) => q.eq("order_status", "return_requested").lt("return_requested_at", dayAgo)),
    count(db, "im_contact_messages", (q) => q.eq("status", "new")),
    count(db, "im_orders", (q) => q.gte("created_at", weekAgo)),
    count(db, "im_profiles", (q) => q.gte("created_at", weekAgo)),
    count(db, "im_profiles", (q) => q.eq("role", "seller").eq("account_status", "active")),
    count(db, "im_products", (q) => q.eq("status", "approved")),
  ]);

  return {
    todo: [
      { key: "products", label: "Listings to review", count: pendingProducts, href: "/admin/products?status=pending" },
      { key: "verifications", label: "PWD IDs to review", count: verifications, href: "/admin/verifications" },
      { key: "flags", label: "Duplicate ID flags", count: flags, href: "/admin/verifications?view=flags" },
      { key: "payouts", label: "Payouts to approve or send", count: payouts, href: "/admin/payouts" },
      { key: "refunds", label: "Orders with a refund due", count: refunds, href: "/admin/orders?view=refunds" },
      { key: "returns", label: "Returns waiting over a day", count: returns, href: "/admin/orders?view=returns" },
      { key: "tickets", label: "Open support requests", count: tickets, href: "/admin/tickets" },
      { key: "privacy", label: "Privacy requests", count: privacy, href: "/admin/compliance#privacy" },
      { key: "contact", label: "Contact messages", count: contact, href: "/admin/compliance#contact" },
    ],
    health: [
      { key: "orders", label: "Orders this week", count: ordersWeek, href: "/admin/orders" },
      { key: "users", label: "New accounts this week", count: newUsers, href: "/admin/users" },
      { key: "sellers", label: "Active sellers", count: sellers, href: "/admin/users?role=seller" },
      { key: "live", label: "Listings in the shop", count: liveProducts, href: "/admin/products?status=approved" },
    ],
  };
}

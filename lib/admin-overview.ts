import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/session";

/**
 * Admin → Overview (C-37): what needs an admin now, and a few health
 * numbers. Each count is independent and tolerant: a table that does not
 * exist yet (an unapplied migration) shows as unavailable, never as 0 and
 * never as an error page.
 *
 * The to-do counts also draw the sidebar's badges (03 §3), so they are read
 * once per request through getAdminTodo(), shared by app/admin/layout.tsx
 * and the overview page. A badge is as fresh as the last full render of the
 * layout: a full load, or router.refresh() after an action. A plain soft
 * navigation between admin pages keeps the layout, and with it the badges,
 * until then.
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

/**
 * The nine "Needs attention" counts, in their tile order. Memoised for one
 * server render (React cache), so the layout's badges and the overview's
 * tiles cost one set of nine HEAD counts between them. Checks the admin role
 * itself: the counts are not for anyone else, whichever page asks.
 */
export const getAdminTodo = cache(async (): Promise<OverviewCount[]> => {
  await requireRole(["admin"]);
  const db = createAdminClient();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

  const [pendingProducts, verifications, flags, payouts, tickets, privacy, refunds, returns, contact] =
    await Promise.all([
      count(db, "im_products", (q) => q.eq("status", "pending")),
      count(db, "im_pwd_verifications", (q) => q.eq("status", "submitted")),
      count(db, "im_pwd_verification_flags", (q) => q.is("resolved_at", null)),
      count(db, "im_payouts", (q) => q.in("status", ["requested", "approved"])),
      count(db, "im_support_tickets", (q) => q.in("ticket_status", ["open", "in_progress"])),
      count(db, "im_privacy_requests", (q) => q.in("status", ["open", "in_progress"])),
      count(db, "im_orders", (q) => q.eq("refund_due", true)),
      count(db, "im_orders", (q) => q.eq("order_status", "return_requested").lt("return_requested_at", dayAgo)),
      count(db, "im_contact_messages", (q) => q.eq("status", "new")),
    ]);

  return [
    { key: "products", label: "Listings to review", count: pendingProducts, href: "/admin/products?status=pending" },
    { key: "verifications", label: "PWD IDs to review", count: verifications, href: "/admin/verifications" },
    { key: "flags", label: "Duplicate ID flags", count: flags, href: "/admin/verifications?view=flags" },
    { key: "payouts", label: "Payouts to approve or send", count: payouts, href: "/admin/payouts" },
    { key: "refunds", label: "Orders with a refund due", count: refunds, href: "/admin/orders?view=refunds" },
    { key: "returns", label: "Returns waiting over a day", count: returns, href: "/admin/orders?view=returns" },
    { key: "tickets", label: "Open support requests", count: tickets, href: "/admin/tickets" },
    { key: "privacy", label: "Privacy requests", count: privacy, href: "/admin/compliance#privacy" },
    { key: "contact", label: "Contact messages", count: contact, href: "/admin/compliance#contact" },
  ];
});

/**
 * The sidebar's badges (03 §3), keyed by the nav item's href, each the sum
 * of the to-do counts behind that page. A count that could not be read
 * adds 0: the sidebar says nothing rather than "Needs a database update",
 * which the overview's tile already says.
 */
const BADGE_SOURCES: Record<string, string[]> = {
  "/admin/verifications": ["verifications", "flags"],
  "/admin/products": ["products"],
  "/admin/orders": ["refunds", "returns"],
  "/admin/tickets": ["tickets"],
  "/admin/payouts": ["payouts"],
  "/admin/compliance": ["privacy", "contact"],
};

export async function getAdminBadges(): Promise<Record<string, number>> {
  const todo = await getAdminTodo();
  const byKey = new Map(todo.map((t) => [t.key, t.count ?? 0]));
  return Object.fromEntries(
    Object.entries(BADGE_SOURCES).map(([href, keys]) => [href, keys.reduce((sum, k) => sum + (byKey.get(k) ?? 0), 0)])
  );
}

export async function getAdminOverview(): Promise<{ todo: OverviewCount[]; health: OverviewCount[] }> {
  const db = createAdminClient();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [todo, ordersWeek, newUsers, sellers, liveProducts] = await Promise.all([
    getAdminTodo(),
    count(db, "im_orders", (q) => q.gte("created_at", weekAgo)),
    count(db, "im_profiles", (q) => q.gte("created_at", weekAgo)),
    count(db, "im_profiles", (q) => q.eq("role", "seller").eq("account_status", "active")),
    count(db, "im_products", (q) => q.eq("status", "approved")),
  ]);

  return {
    todo,
    health: [
      { key: "orders", label: "Orders this week", count: ordersWeek, href: "/admin/orders" },
      { key: "users", label: "New accounts this week", count: newUsers, href: "/admin/users" },
      { key: "sellers", label: "Active sellers", count: sellers, href: "/admin/users?role=seller" },
      { key: "live", label: "Listings in the shop", count: liveProducts, href: "/admin/products?status=approved" },
    ],
  };
}

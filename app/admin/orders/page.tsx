import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getAdminOrders, type AdminOrderView } from "@/lib/data";
import { AdminOrdersClient } from "@/components/AdminOrdersClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders" };

const VIEWS: { id: AdminOrderView; label: string }[] = [
  { id: "all", label: "Recent" },
  { id: "open", label: "In progress" },
  { id: "returns", label: "Returns" },
  { id: "refunds", label: "Refunds due" },
  { id: "cancelled", label: "Cancelled" },
];

/** Admin → Orders (C-40): every order, plus the ones that need support. */
export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireRole(["admin"]);
  const raw = (await searchParams).view;
  const view = VIEWS.find((v) => v.id === raw)?.id ?? "all";
  const orders = await getAdminOrders(view);
  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <h1>Orders</h1>
      <nav className="tabs" aria-label="Order lists">
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            href={v.id === "all" ? "/admin/orders" : `/admin/orders?view=${v.id}`}
            className={`tab${v.id === view ? " tab--active" : ""}`}
            aria-current={v.id === view ? "page" : undefined}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      <AdminOrdersClient orders={orders} />
    </main>
  );
}

import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getAdminPayouts, type PayoutStatus } from "@/lib/finance";
import { AdminPayoutsClient } from "@/components/AdminPayoutsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payouts" };

const VIEWS: { id: PayoutStatus | "all"; label: string }[] = [
  { id: "requested", label: "To approve" },
  { id: "approved", label: "To send" },
  { id: "paid", label: "Paid" },
  { id: "rejected", label: "Not sent" },
  { id: "all", label: "All" },
];

export default async function AdminPayoutsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireRole(["admin"]);
  const raw = (await searchParams).view;
  const view = VIEWS.find((v) => v.id === raw)?.id ?? "requested";
  const payouts = await getAdminPayouts(view);
  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <h1>Payouts</h1>
      <nav className="tabs" aria-label="Payout lists">
        {VIEWS.map((v) => (
          <Link key={v.id} href={v.id === "requested" ? "/admin/payouts" : `/admin/payouts?view=${v.id}`} className={`tab${v.id === view ? " tab--active" : ""}`} aria-current={v.id === view ? "page" : undefined}>
            {v.label}
          </Link>
        ))}
      </nav>
      {payouts === null ? <p className="notice notice--info">Payouts need database migration 0020.</p> : <AdminPayoutsClient payouts={payouts} />}
    </main>
  );
}

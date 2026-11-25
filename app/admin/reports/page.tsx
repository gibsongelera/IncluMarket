import { requireRole } from "@/lib/session";
import { AdminReportsClient } from "@/components/AdminReportsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default async function AdminReportsPage() {
  const session = await requireRole(["admin"]);

  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <h1>Reports</h1>
      <p className="muted">
        Download Office Open XML (`.xlsx`) workbooks with real display names,
        numeric IDs/amounts, ISO 8601 UTC timestamps, and ISO 4217 currency code
        PHP. Emails stay masked. File names follow{" "}
        <code>InclusiveMarket_&lt;Report&gt;_Report_YYYY-MM-DD.xlsx</code>.
      </p>
      <AdminReportsClient />
    </main>
  );
}

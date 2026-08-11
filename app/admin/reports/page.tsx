import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AdminReportsClient } from "@/components/AdminReportsClient";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const session = await requireRole(["admin"]);

  return (
    <>
      <SiteHeader variant="admin" active="reports" session={session} />
      <main id="main" tabIndex={-1} className="container main--admin">
        <h1>Reports</h1>
        <p className="muted">
          Download Office Open XML (`.xlsx`) workbooks with real display names,
          numeric IDs/amounts, ISO 8601 UTC timestamps, and ISO 4217 currency code
          PHP. Emails stay masked. File names follow{" "}
          <code>IncluMarket_&lt;Report&gt;_Report_YYYY-MM-DD.xlsx</code>.
        </p>
        <AdminReportsClient />
      </main>
      <SiteFooter />
    </>
  );
}

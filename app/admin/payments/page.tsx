import { requireRole } from "@/lib/session";
import { listPaymentProviders } from "@/lib/actions/payments";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AdminPaymentsClient } from "@/components/AdminPaymentsClient";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  const session = await requireRole(["admin"]);
  const providers = await listPaymentProviders();

  return (
    <>
      <SiteHeader variant="admin" active="payments" session={session} />
      <main id="main" tabIndex={-1} className="container main--admin">
        <h1>Payment providers</h1>
        <AdminPaymentsClient providers={providers} />
      </main>
      <SiteFooter />
    </>
  );
}

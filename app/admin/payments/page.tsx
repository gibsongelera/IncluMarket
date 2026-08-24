import { requireRole } from "@/lib/session";
import { listPaymentProviders } from "@/lib/actions/payments";
import { isPaymentSimulationEnabled } from "@/lib/actions/payments-dev";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AdminPaymentsClient } from "@/components/AdminPaymentsClient";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  const session = await requireRole(["admin"]);
  const [providers, simulationEnabled] = await Promise.all([
    listPaymentProviders(),
    isPaymentSimulationEnabled(),
  ]);

  return (
    <>
      <SiteHeader variant="admin" active="payments" session={session} />
      <main id="main" tabIndex={-1} className="container main--admin">
        <h1>Payment providers</h1>
        <AdminPaymentsClient providers={providers} simulationEnabled={simulationEnabled} />
      </main>
      <SiteFooter />
    </>
  );
}

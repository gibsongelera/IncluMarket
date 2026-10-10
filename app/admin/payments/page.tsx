import { requireRole } from "@/lib/session";
import { listPaymentProviders } from "@/lib/actions/payments";
import { isPaymentSimulationEnabled } from "@/lib/actions/payments-dev";
import { AdminPaymentsClient } from "@/components/AdminPaymentsClient";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  const session = await requireRole(["admin"]);
  const [providers, simulationEnabled] = await Promise.all([
    listPaymentProviders(),
    isPaymentSimulationEnabled(),
  ]);

  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <h1>Payment providers</h1>
      <AdminPaymentsClient providers={providers} simulationEnabled={simulationEnabled} />
    </main>
  );
}

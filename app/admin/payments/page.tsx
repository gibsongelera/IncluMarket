import { requireRole } from "@/lib/session";
import { isPaymentSimulationEnabled } from "@/lib/actions/payments-dev";
import { getPaymentStatus } from "@/lib/payments/status";
import { AdminPaymentsClient } from "@/components/AdminPaymentsClient";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments" };

/**
 * Admin → Payments (D-03): read-only status. Nothing here can switch on a
 * provider the shop does not support; online payment is PayMongo, turned on
 * by its keys in the deployment's environment.
 */
export default async function AdminPaymentsPage() {
  await requireRole(["admin"]);
  const [status, simulationEnabled] = await Promise.all([getPaymentStatus(), isPaymentSimulationEnabled()]);
  const { online, week } = status;

  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <h1>Payments</h1>
      <p className="muted">
        Buyers can pay cash on delivery or online through PayMongo. This page shows what checkout offers right now. To
        change it, a developer updates the PayMongo keys in the hosting settings — there are no switches here.
      </p>

      <section className="card setting-row" aria-labelledby="pay-cod">
        <h2 id="pay-cod">Cash on delivery</h2>
        <p>
          <span className="pill pill--active">Available</span> Always offered. The seller collects payment when the
          order arrives.
        </p>
      </section>

      <section className="card setting-row" aria-labelledby="pay-online">
        <h2 id="pay-online">Online payment (PayMongo)</h2>
        {online.configured ? (
          <p>
            <span className="pill pill--active">Available</span>{" "}
            {online.mode === "live"
              ? "Live — real money is charged."
              : "Test mode — no real money moves. Switch to live keys before launch."}
          </p>
        ) : (
          <p>
            <span className="pill pill--archived">Off</span> Not set up, so checkout offers cash on delivery only.
          </p>
        )}
        <p>Methods on PayMongo&rsquo;s payment page: {online.methods.join(", ")}.</p>
        {online.configured && online.modeMismatch ? (
          <p className="notice notice--warning">
            PAYMONGO_ENV does not match the kind of secret key that is set (test or live), so payment confirmations
            will be refused. Make them match in the hosting settings.
          </p>
        ) : null}
        {online.configured && !online.webhook ? (
          <p className="notice notice--warning">
            The webhook secret is missing, so paid orders will not be confirmed automatically. Set
            PAYMONGO_WEBHOOK_SECRET in the hosting settings.
          </p>
        ) : online.configured ? (
          <p className="small muted">Payment confirmations (webhook) are set up.</p>
        ) : null}
      </section>

      {week ? (
        <section className="kpis" aria-label="Online payments in the last 7 days">
          <article className="kpi">
            <span className="kpi__label">Paid online, last 7 days</span>
            <strong className="kpi__value">{week.paid}</strong>
          </article>
          <article className="kpi">
            <span className="kpi__label">Waiting for payment</span>
            <strong className="kpi__value">{week.pending}</strong>
          </article>
          <article className="kpi">
            <span className="kpi__label">Failed</span>
            <strong className="kpi__value">{week.failed}</strong>
          </article>
          <article className="kpi">
            <span className="kpi__label">Refunded</span>
            <strong className="kpi__value">{week.refunded}</strong>
          </article>
        </section>
      ) : null}
      <p className="small muted">
        {status.lastPaidAt ? `Last online payment: ${formatDateTime(status.lastPaidAt)}.` : "No online payments yet."} Refunds
        are recorded on the Orders page.
      </p>

      {simulationEnabled ? <AdminPaymentsClient /> : null}
    </main>
  );
}

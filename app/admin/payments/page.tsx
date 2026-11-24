import Link from "next/link";
import { requireRole } from "@/lib/session";
import { isPaymentSimulationEnabled } from "@/lib/actions/payments-dev";
import { getPaymentStatus } from "@/lib/payments/status";
import { AdminPaymentsClient } from "@/components/AdminPaymentsClient";
import { formatDateTime, money } from "@/lib/format";
import { getCounterAccounts, getCounterHoldHours, getProofQueue, QUEUE_LIMIT } from "@/lib/counter-payments";
import { AdminProofQueue } from "@/components/AdminProofQueue";
import { AdminCounterAccounts } from "@/components/AdminCounterAccounts";
import { Pill } from "@/components/Pill";
import { TableWrap } from "@/components/TableWrap";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments" };

/**
 * Admin → Payments (D-03). Online payment is PayMongo, turned on by its keys
 * in the deployment's environment, so its part is read-only status. Paying
 * the Workshop over the counter (migration 0028) is run from here: the
 * payments buyers sent to check, and the accounts they pay into.
 */
export default async function AdminPaymentsPage() {
  await requireRole(["admin"]);
  const [status, simulationEnabled, accounts, queue, holdHours] = await Promise.all([
    getPaymentStatus(),
    isPaymentSimulationEnabled(),
    getCounterAccounts(),
    getProofQueue(),
    getCounterHoldHours(),
  ]);
  const { online, week } = status;
  const counterReady = accounts !== null && queue !== null;
  const activeAccounts = (accounts ?? []).filter((a) => a.active);

  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <h1>Payments</h1>
      <p className="muted">
        Buyers can pay cash on delivery, online through PayMongo, or to the {SITE.workshop.name} ({SITE.workshop.under})
        by GCash, Maribank or LandBank. The Workshop&rsquo;s accounts and the payments to check are below; PayMongo is
        switched on by its keys in the hosting settings.
      </p>

      <section id="to-check" className="card setting-row" aria-labelledby="pay-check" tabIndex={-1}>
        <h2 id="pay-check">Payments to check</h2>
        {!counterReady ? (
          <p className="notice notice--info">
            Paying the Workshop needs database migration 0028 (supabase/migrations/0028_counter_payments.sql). Until it
            is applied, checkout offers cash on delivery and online payment only.
          </p>
        ) : queue.toCheck.length === 0 ? (
          <div className="empty">
            <p>
              <strong>Nothing to check.</strong> When a buyer pays the Workshop and sends the reference number, it shows
              here for you to find in the account and confirm.
            </p>
          </div>
        ) : (
          <>
            <p className="muted small">
              Oldest first. Find each reference number in the Workshop&rsquo;s account before you confirm it.
              {queue.toCheck.length >= QUEUE_LIMIT ? ` Showing the oldest ${QUEUE_LIMIT}.` : ""}
            </p>
            <AdminProofQueue rows={queue.toCheck} />
          </>
        )}
      </section>

      {counterReady && queue.reviewed.length ? (
        <section className="card setting-row" aria-labelledby="pay-checked">
          <h2 id="pay-checked">Recently checked</h2>
          <TableWrap label="Recently checked payments">
            <table className="data-table data-table--cards" aria-label="Recently checked payments">
              <thead>
                <tr>
                  <th scope="col">Checked</th>
                  <th scope="col">Buyer</th>
                  <th scope="col">Paid by</th>
                  <th scope="col">Reference</th>
                  <th scope="col" className="num">Amount</th>
                  <th scope="col">Decision</th>
                </tr>
              </thead>
              <tbody>
                {queue.reviewed.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span>{p.reviewedAt ? formatDateTime(p.reviewedAt) : "—"}</span>
                      {p.reviewedBy ? <span className="small muted"> · by {p.reviewedBy}</span> : null}
                    </td>
                    <td>
                      <span>{p.buyerName}</span>
                      <span className="small muted"> · Checkout #{p.checkoutId}</span>
                    </td>
                    <td>{p.channelLabel}</td>
                    <td>
                      <span className="mono">{p.reference}</span>
                    </td>
                    <td className="num">{money(p.amount)}</td>
                    <td>
                      <Pill status={p.status} label={p.status === "approved" ? "confirmed" : "not received"} />
                      {p.status === "rejected" && p.reviewNote ? <span className="small muted"> · {p.reviewNote}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </section>
      ) : null}

      <section id="accounts" className="card setting-row" aria-labelledby="pay-otc" tabIndex={-1}>
        <h2 id="pay-otc">Pay the Workshop: GCash, Maribank, LandBank</h2>
        {!counterReady ? (
          <p>
            <span className="pill pill--archived">Off</span> Needs database migration 0028.
          </p>
        ) : (
          <>
            <p>
              {activeAccounts.length ? (
                <>
                  <span className="pill pill--active">Available</span> Checkout offers{" "}
                  {activeAccounts.map((a) => a.label).join(", ")}.
                </>
              ) : (
                <>
                  <span className="pill pill--archived">Off</span> Switch on at least one account below to offer it at
                  checkout.
                </>
              )}{" "}
              An unpaid order keeps its items for {holdHours} hours (<Link href="/admin/settings">Settings</Link>), then it is
              cancelled. Sellers are paid from these payments through Payouts, as for online payments.
            </p>
            <AdminCounterAccounts
              initial={(accounts ?? []).map((a) => ({
                channel: a.channel,
                accountName: a.accountName,
                accountNumber: a.accountNumber,
                instructions: a.instructions ?? "",
                active: a.active,
              }))}
            />
          </>
        )}
      </section>

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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminCancelOrder, adminSettleReturn, markRefundSent } from "@/lib/actions/admin-orders";
import type { AdminOrderLite } from "@/lib/data";
import { buyerStatusText } from "@/lib/orders/state";
import { formatDateTime, money } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { TableWrap } from "./TableWrap";

type Ask = { kind: "accept" | "decline" | "cancel" | "refund"; order: AdminOrderLite };

/** Admin → Orders (C-40): disputes, cancellations, refunds. */
export function AdminOrdersClient({ orders }: { orders: AdminOrderLite[] }) {
  const router = useRouter();
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(text: string) {
    if (!ask) return;
    setBusy(true);
    const id = ask.order.id;
    const res =
      ask.kind === "accept"
        ? await adminSettleReturn(id, "returned", text)
        : ask.kind === "decline"
          ? await adminSettleReturn(id, "delivered", text)
          : ask.kind === "cancel"
            ? await adminCancelOrder(id, text)
            : await markRefundSent(id, text);
    setBusy(false);
    if (!res.ok) return setError(res.error || "That did not work.");
    setAsk(null);
    toast("Done. Buyer and seller have been told.", "success");
    router.refresh();
  }

  function open(kind: Ask["kind"], order: AdminOrderLite) {
    setError(null);
    setAsk({ kind, order });
  }

  if (!orders.length) return <p className="empty">No orders here.</p>;

  const title =
    ask?.kind === "refund"
      ? `Record the refund for order #${ask.order.id}`
      : ask?.kind === "accept"
        ? `Accept the return for order #${ask.order.id}?`
        : ask?.kind === "decline"
          ? `Decline the return for order #${ask.order.id}?`
          : `Cancel order #${ask?.order.id ?? ""}?`;

  return (
    <>
      <TableWrap label="Orders">
        <table className="data-table data-table--cards">
          <thead>
            <tr>
              <th>Order</th>
              <th>Buyer</th>
              <th>Seller</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} data-row-id={o.id}>
                <td>
                  <strong>#{o.id}</strong>
                  <div className="small muted">{formatDateTime(o.createdAt)}</div>
                </td>
                <td>{o.buyerName}</td>
                <td>{o.sellerName ?? "Several"}</td>
                <td className="price">{money(o.total)}</td>
                <td>
                  {o.paymentProvider === "paymongo" ? "Online" : "Cash on delivery"}
                  <div className="small muted">{o.paymentStatus}</div>
                </td>
                <td>
                  <span className={`pill pill--${o.status}`}>
                    {buyerStatusText({
                      order_status: o.status as never,
                      payment_provider: o.paymentProvider,
                      payment_status: o.paymentStatus as never,
                    })}
                  </span>
                  {o.refundDue ? <div className="field-error small">Refund due</div> : null}
                  {o.returnReason ? <div className="small">Return reason: {o.returnReason}</div> : null}
                  {o.cancelReason ? <div className="small muted">Cancelled: {o.cancelReason}</div> : null}
                </td>
                <td>
                  {o.refundDue ? (
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => open("refund", o)}>
                      Refund sent…
                    </button>
                  ) : null}
                  {o.status === "return_requested" ? (
                    <>
                      <button type="button" className="btn btn--outline btn--sm" onClick={() => open("accept", o)}>
                        Accept return…
                      </button>{" "}
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => open("decline", o)}>
                        Decline return…
                      </button>
                    </>
                  ) : null}
                  {o.status === "pending" || o.status === "processing" ? (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => open("cancel", o)}>
                      Cancel order…
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <ConfirmDialog
        open={Boolean(ask)}
        title={title}
        confirmLabel={ask?.kind === "refund" ? "Save" : ask?.kind === "cancel" ? "Cancel order" : "Confirm"}
        cancelLabel="Back"
        tone={ask?.kind === "cancel" ? "danger" : "primary"}
        busy={busy}
        error={error}
        reason={
          ask?.kind === "refund"
            ? { label: "Refund reference (PayMongo refund ID or transfer number)", required: true, minLength: 3 }
            : { label: "Reason (buyer and seller read this)", required: true, minLength: 5 }
        }
        onCancel={() => setAsk(null)}
        onConfirm={run}
      >
        {ask?.kind === "refund" ? (
          <p>Record this only after the money was sent back to the buyer. Total: {money(ask.order.total)}.</p>
        ) : ask?.kind === "cancel" ? (
          <p>Items held for the order go back to stock. If it was paid online, a refund becomes due.</p>
        ) : (
          <p>This settles a disagreement between buyer and seller.</p>
        )}
      </ConfirmDialog>
    </>
  );
}

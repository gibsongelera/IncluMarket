"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminCancelOrder, adminSettleReturn, markRefundSent } from "@/lib/actions/admin-orders";
import type { AdminOrderRow } from "@/lib/admin-list-types";
import { buyerStatusText } from "@/lib/orders/state";
import { formatDateTime, initials, money } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { DeepLinkFocus } from "./DeepLinkFocus";
import { Pill } from "./Pill";
import { RowActions } from "./RowActions";
import { TableWrap } from "./TableWrap";
import { useRowFocus } from "./useRowFocus";

type Ask = { kind: "accept" | "decline" | "cancel" | "refund"; order: AdminOrderRow };

/** An empty list's sentence, and a link out of it when there is one. */
export interface OrdersEmpty {
  text: string;
  href?: string;
  action?: string;
}

/** Admin → Orders (C-40): one page of orders, with disputes, cancellations and refunds in each row's Actions. */
export function AdminOrdersClient({ rows, empty }: { rows: AdminOrderRow[]; empty: OrdersEmpty }) {
  const router = useRouter();
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Where focus goes when an action takes the row off this view (a return
  // settled on Returns, an order cancelled on In progress).
  const focus = useRowFocus(rows);

  async function run(text: string) {
    if (!ask) return;
    setBusy(true);
    const id = ask.order.id;
    // Before the await: the refreshed rows can land before it resolves.
    focus.mark(id);
    const res =
      ask.kind === "accept"
        ? await adminSettleReturn(id, "returned", text)
        : ask.kind === "decline"
          ? await adminSettleReturn(id, "delivered", text)
          : ask.kind === "cancel"
            ? await adminCancelOrder(id, text)
            : await markRefundSent(id, text);
    setBusy(false);
    if (!res.ok) {
      focus.clear();
      return setError(res.error || "That did not work.");
    }
    setAsk(null);
    toast("Done. Buyer and seller have been told.", "success");
    router.refresh();
  }

  function open(kind: Ask["kind"], order: AdminOrderRow) {
    setError(null);
    setAsk({ kind, order });
  }

  // DeepLinkFocus stays on an empty list too: it moves focus to the page's
  // "not in this list" note when ?focus= names an order that is not here.
  if (!rows.length) {
    return (
      <>
        <DeepLinkFocus />
        <div className="empty">
          <p ref={focus.emptyRef} tabIndex={-1}>
            {empty.text}
          </p>
          {empty.href && empty.action ? (
            <Link className="btn btn--outline" href={empty.href}>
              {empty.action}
            </Link>
          ) : null}
        </div>
      </>
    );
  }

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
      <DeepLinkFocus />
      <TableWrap label="Orders">
        <table className="data-table data-table--cards" aria-label="Orders, newest first">
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Buyer</th>
              <th scope="col">Shop</th>
              <th scope="col" className="num">
                Total
              </th>
              <th scope="col">Payment</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} data-row-id={o.id}>
                <td>
                  <strong className="cell-code">#{o.id}</strong>
                  <div className="small muted">{formatDateTime(o.createdAt)}</div>
                </td>
                <td>
                  <div className="cell-identity">
                    <span className="avatar" aria-hidden="true">
                      {initials(o.buyerName)}
                    </span>
                    <span className="cell-identity__text">
                      <span className="cell-identity__name">{o.buyerName}</span>
                    </span>
                  </div>
                </td>
                <td>{o.sellerName ?? "Several shops"}</td>
                <td className="num">{money(o.total)}</td>
                <td>
                  <Pill status={o.paymentStatus} />
                  <div className="small muted">{o.paymentProvider === "paymongo" ? "Online" : "Cash on delivery"}</div>
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
                <td className="cell-actions">
                  <RowActions label={`order #${o.id}`}>
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
                  </RowActions>
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

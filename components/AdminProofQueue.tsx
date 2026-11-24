"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { formatDateTime, money } from "@/lib/format";
import { getReceiptLink, reviewPaymentProof } from "@/lib/actions/counter-payments";
import type { ProofRow } from "@/lib/counter-payments";
import { ConfirmDialog } from "./ConfirmDialog";
import { TableWrap } from "./TableWrap";

type Ask = { kind: "approve" | "reject"; proof: ProofRow };

/**
 * Admin → Payments → Payments to check (migration 0028): what buyers sent
 * after paying the Workshop. The admin finds the payment in the Workshop's
 * GCash, Maribank or LandBank account by its reference number, then confirms
 * it (the orders move on, as after an online payment) or says it did not
 * arrive, with a reason the buyer reads.
 */
export function AdminProofQueue({ rows }: { rows: ProofRow[] }) {
  const router = useRouter();
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ url: string; proof: ProofRow } | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const receiptRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dlg = receiptRef.current;
    if (!dlg) return;
    if (receipt && !dlg.open) dlg.showModal();
    if (!receipt && dlg.open) dlg.close();
  }, [receipt]);

  async function openReceipt(p: ProofRow, button: HTMLElement) {
    returnFocus.current = button;
    setOpening(p.id);
    const res = await getReceiptLink(p.id);
    setOpening(null);
    if (!res.ok || !res.url) {
      toast(res.error || "The receipt photo could not be opened.", "error");
      return;
    }
    setReceipt({ url: res.url, proof: p });
  }

  function closeReceipt() {
    setReceipt(null);
    returnFocus.current?.focus();
  }

  async function decide(note: string) {
    if (!ask) return;
    setBusy(true);
    setError(null);
    const res = await reviewPaymentProof(ask.proof.id, ask.kind, note);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Could not save that.");
      return;
    }
    toast(
      ask.kind === "approve"
        ? `Payment confirmed. The seller${ask.proof.orderIds.length === 1 ? " was" : "s were"} told to prepare the order.`
        : "Marked as not received. The buyer was told why.",
      "success"
    );
    setAsk(null);
    router.refresh();
  }

  return (
    <>
      <TableWrap label="Payments to check">
        <table className="data-table data-table--cards" aria-label="Payments to check">
          <thead>
            <tr>
              <th scope="col">Sent</th>
              <th scope="col">Buyer</th>
              <th scope="col">Paid by</th>
              <th scope="col">Reference</th>
              <th scope="col" className="num">Amount</th>
              <th scope="col">Receipt</th>
              <th scope="col">Decide</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const short = p.amount < p.due - 0.004;
              const over = p.amount > p.due + 0.004;
              return (
                <tr key={p.id}>
                  <td>
                    <span>{formatDateTime(p.createdAt)}</span>
                    <span className="small muted"> · Checkout #{p.checkoutId}</span>
                  </td>
                  <td>
                    <span>{p.buyerName}</span>
                    <span className="small muted">
                      {" "}
                      · {p.orderIds.length === 1 ? "Order" : "Orders"} #{p.orderIds.join(", #")}
                    </span>
                  </td>
                  <td>{p.channelLabel}</td>
                  <td>
                    <span className="mono">{p.reference}</span>
                  </td>
                  <td className="num">
                    <span>{money(p.amount)}</span>
                    {short || over ? (
                      <span className="pay-mismatch small"> · Due {money(p.due)}{short ? " (less than due)" : " (more than due)"}</span>
                    ) : (
                      <span className="small muted"> · matches</span>
                    )}
                    {p.cancelledOrders ? (
                      <span className="small pay-mismatch">
                        {" "}
                        · {p.cancelledOrders === p.orderIds.length ? "Checkout cancelled" : `${p.cancelledOrders} order cancelled`}: confirming
                        flags a refund
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {p.hasReceipt ? (
                      <button
                        type="button"
                        className="btn btn--outline btn--sm"
                        disabled={opening === p.id}
                        onClick={(e) => openReceipt(p, e.currentTarget)}
                      >
                        {opening === p.id ? "Opening…" : "View receipt"}
                        <span className="sr-only"> from {p.buyerName}</span>
                      </button>
                    ) : (
                      <span className="muted small">No photo</span>
                    )}
                  </td>
                  <td>
                    <span className="row-actions">
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        onClick={() => {
                          setError(null);
                          setAsk({ kind: "approve", proof: p });
                        }}
                      >
                        Confirm payment<span className="sr-only"> of {money(p.amount)} from {p.buyerName}</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => {
                          setError(null);
                          setAsk({ kind: "reject", proof: p });
                        }}
                      >
                        Not received<span className="sr-only"> ({p.buyerName})</span>
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>

      <ConfirmDialog
        open={ask?.kind === "approve"}
        title="Confirm this payment?"
        confirmLabel="Confirm payment"
        busy={busy}
        error={error}
        onConfirm={(note) => decide(note)}
        onCancel={() => setAsk(null)}
      >
        {ask ? (
          <>
            <p>
              {money(ask.proof.amount)} by {ask.proof.channelLabel}, reference <span className="mono">{ask.proof.reference}</span>,
              from {ask.proof.buyerName}. Only confirm it once you have found it in the Workshop&rsquo;s{" "}
              {ask.proof.channelLabel} account.
            </p>
            <p>
              {ask.proof.cancelledOrders
                ? "Orders of this checkout that were cancelled are flagged for a refund; the rest go to their sellers."
                : `The seller${ask.proof.orderIds.length === 1 ? " is" : "s are"} told to prepare the order, and the buyer is emailed.`}
            </p>
          </>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={ask?.kind === "reject"}
        title="Payment not received?"
        confirmLabel="Tell the buyer"
        tone="danger"
        busy={busy}
        error={error}
        reason={{
          label: "What should the buyer check?",
          required: true,
          minLength: 5,
          maxLength: 500,
          hint: "The buyer reads this. For example: No GCash payment with this reference reached the Workshop.",
        }}
        onConfirm={(note) => decide(note)}
        onCancel={() => setAsk(null)}
      >
        {ask ? (
          <p>
            {ask.proof.buyerName} can send the details again. Their items stay reserved until the hold runs out.
          </p>
        ) : null}
      </ConfirmDialog>

      <dialog
        ref={receiptRef}
        className="modal pay-receipt"
        aria-labelledby="receipt-title"
        onCancel={(e) => {
          e.preventDefault();
          closeReceipt();
        }}
      >
        {receipt ? (
          <div className="modal-form">
            <h2 id="receipt-title">Receipt from {receipt.proof.buyerName}</h2>
            <p className="small muted">
              {receipt.proof.channelLabel} · <span className="mono">{receipt.proof.reference}</span> · {money(receipt.proof.amount)}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={receipt.url} alt={`Receipt photo sent by ${receipt.proof.buyerName}`} />
            <div className="form-actions">
              <button type="button" className="btn btn--primary" autoFocus onClick={closeReceipt}>
                Close
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approvePayout, markPayoutPaid, rejectPayout } from "@/lib/actions/payouts";
import type { PayoutLite } from "@/lib/finance";
import { formatDateTime, money } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { TableWrap } from "./TableWrap";

const METHOD_TEXT: Record<string, string> = { gcash: "GCash", maya: "Maya", bank: "Bank transfer" };

/** Admin → Payouts (C-35): approve, reject with a reason, mark paid with the reference. */
export function AdminPayoutsClient({ payouts }: { payouts: PayoutLite[] }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState<PayoutLite | null>(null);
  const [paying, setPaying] = useState<PayoutLite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve(p: PayoutLite) {
    setBusy(true);
    const res = await approvePayout(p.id);
    setBusy(false);
    if (!res.ok) return toast(res.error || "Could not approve.", "error");
    toast(`Approved ${money(p.amount)} for ${p.sellerName}. Mark it paid after sending.`, "success");
    router.refresh();
  }

  if (!payouts.length) return <p className="empty">Nothing here.</p>;

  return (
    <>
      <TableWrap label="Payouts">
        <table className="data-table data-table--cards">
          <thead>
            <tr>
              <th>Seller</th>
              <th>Amount</th>
              <th>Send to</th>
              <th>Requested</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={p.id}>
                <td>{p.sellerName}</td>
                <td className="price">{money(p.amount)}</td>
                <td>
                  {METHOD_TEXT[p.method] ?? p.method}
                  <div className="mono small">{p.account}</div>
                  {p.note ? <div className="small muted">{p.note}</div> : null}
                </td>
                <td>{formatDateTime(p.createdAt)}</td>
                <td>
                  {p.status === "paid" ? `Paid · ref ${p.reference ?? "—"}` : p.status === "rejected" ? "Not sent" : p.status === "approved" ? "Approved — send it" : "Waiting for approval"}
                </td>
                <td>
                  {p.status === "requested" ? (
                    <>
                      <button type="button" className="btn btn--primary btn--sm" onClick={() => approve(p)} disabled={busy}>
                        Approve
                      </button>{" "}
                    </>
                  ) : null}
                  {p.status === "approved" ? (
                    <>
                      <button type="button" className="btn btn--primary btn--sm" onClick={() => { setError(null); setPaying(p); }}>
                        Mark paid…
                      </button>{" "}
                    </>
                  ) : null}
                  {p.status === "requested" || p.status === "approved" ? (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setError(null); setRejecting(p); }}>
                      Reject…
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <ConfirmDialog
        open={Boolean(paying)}
        title={`Mark ${paying ? money(paying.amount) : ""} as paid?`}
        confirmLabel="Mark paid"
        busy={busy}
        error={error}
        reason={{ label: "Transfer reference number", required: true, minLength: 3, hint: "From the GCash, Maya or bank receipt. The seller sees it." }}
        onCancel={() => setPaying(null)}
        onConfirm={async (ref) => {
          if (!paying) return;
          setBusy(true);
          const res = await markPayoutPaid(paying.id, ref);
          setBusy(false);
          if (!res.ok) return setError(res.error || "Could not update.");
          setPaying(null);
          toast("Marked paid. The seller has been told.", "success");
          router.refresh();
        }}
      >
        <p>Only after the money was sent to {paying?.sellerName}.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(rejecting)}
        title={`Do not send ${rejecting ? money(rejecting.amount) : ""}?`}
        confirmLabel="Reject"
        tone="danger"
        busy={busy}
        error={error}
        reason={{ label: "Reason (the seller sees this)", required: true, minLength: 5 }}
        onCancel={() => setRejecting(null)}
        onConfirm={async (why) => {
          if (!rejecting) return;
          setBusy(true);
          const res = await rejectPayout(rejecting.id, why);
          setBusy(false);
          if (!res.ok) return setError(res.error || "Could not update.");
          setRejecting(null);
          toast("Rejected. The amount is back in the seller's available balance.", "success");
          router.refresh();
        }}
      >
        <p>The amount returns to the seller&rsquo;s available balance.</p>
      </ConfirmDialog>
    </>
  );
}

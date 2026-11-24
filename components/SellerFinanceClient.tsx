"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelPayoutRequest, requestPayout } from "@/lib/actions/payouts";
import type { SellerFinance } from "@/lib/finance";
import { formatDate, money } from "@/lib/format";
import { toast } from "@/lib/toast";
import { TableWrap } from "./TableWrap";

const AVAIL_TEXT = {
  available: "Available",
  pending: "In return window",
  collected: "Collected by you (cash)",
  not_earned: "Not earned",
} as const;
const PAYOUT_TEXT = { requested: "Waiting", approved: "Approved", paid: "Paid", rejected: "Not sent" } as const;
const METHOD_TEXT: Record<string, string> = { gcash: "GCash", maya: "Maya", bank: "Bank transfer" };

/** Seller Centre → Finance (C-35). */
export function SellerFinanceClient({ finance }: { finance: SellerFinance }) {
  const router = useRouter();
  const b = finance.balance;
  const [form, setForm] = useState({ amount: b.available >= finance.minPayout ? String(b.available) : "", method: "gcash", account: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await requestPayout({ amount: Number(form.amount), method: form.method, account: form.account, note: form.note });
    setBusy(false);
    if (!res.ok) return setError(res.error || "Could not send your request.");
    toast("Payout requested. We will tell you when it is approved and sent.", "success");
    setForm({ amount: "", method: form.method, account: "", note: "" });
    router.refresh();
  }

  async function cancel(id: number) {
    const res = await cancelPayoutRequest(id);
    if (!res.ok) return toast(res.error || "Could not cancel it.", "error");
    toast("Request cancelled. The amount is back in your available balance.", "success");
    router.refresh();
  }

  return (
    <>
      <section className="kpis" aria-label="Balance">
        <article className="kpi">
          <span className="kpi__label">Available to withdraw</span>
          <strong className="kpi__value">{money(b.available)}</strong>
        </article>
        <article className="kpi">
          <span className="kpi__label">In the return window</span>
          <strong className="kpi__value">{money(b.pending)}</strong>
        </article>
        <article className="kpi">
          <span className="kpi__label">In payout requests</span>
          <strong className="kpi__value">{money(b.reserved)}</strong>
        </article>
        <article className="kpi">
          <span className="kpi__label">Paid out</span>
          <strong className="kpi__value">{money(b.paidOut)}</strong>
        </article>
        <article className="kpi">
          <span className="kpi__label">Cash you collected</span>
          <strong className="kpi__value">{money(b.collected)}</strong>
        </article>
      </section>
      <p className="hint">
        Online payments become available once the order is delivered and the return window has passed. Cash on
        delivery stays with you and is never paid out.
        {finance.feePercent ? ` A ${finance.feePercent}% platform fee applies to online sales.` : " There is no platform fee."}
      </p>

      <div className="account-grid">
        <form className="card form" onSubmit={submit} noValidate aria-labelledby="po-title">
          <h2 id="po-title">Request a payout</h2>
          <div className="field">
            <label htmlFor="po-amount">Amount (₱)</label>
            <input id="po-amount" type="number" min={finance.minPayout} step="0.01" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} aria-describedby="po-amount-hint" />
            <p className="hint" id="po-amount-hint">
              From {money(finance.minPayout)} up to {money(b.available)}.
            </p>
          </div>
          <div className="field">
            <label htmlFor="po-method">Send to</label>
            <select id="po-method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option value="gcash">GCash</option>
              <option value="maya">Maya</option>
              <option value="bank">Bank transfer</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="po-account">{form.method === "bank" ? "Bank account number" : "Mobile number"}</label>
            <input id="po-account" inputMode="numeric" autoComplete="off" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="po-note">
              Note <span className="muted">(optional, e.g. bank name and account holder)</span>
            </label>
            <input id="po-note" maxLength={300} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="form-actions form-actions--start">
            <button type="submit" className="btn btn--primary" disabled={busy || b.available < finance.minPayout}>
              {busy ? "Sending…" : "Request payout"}
            </button>
          </div>
          {b.available < finance.minPayout ? <p className="hint">You can request a payout once {money(finance.minPayout)} is available.</p> : null}
        </form>

        <section className="card" aria-labelledby="ph-title">
          <h2 id="ph-title">Payouts</h2>
          {finance.payouts.length ? (
            <ul className="notif-list" role="list">
              {finance.payouts.map((p) => (
                <li key={p.id} className="notif-item">
                  <div className="notif-item__body">
                    <p className="notif-item__title">
                      {money(p.amount)} · {METHOD_TEXT[p.method] ?? p.method} {p.accountMasked}
                    </p>
                    <p className="small">
                      <span className={`pill pill--${p.status === "paid" ? "approved" : p.status === "rejected" ? "cancelled" : "processing"}`}>{PAYOUT_TEXT[p.status]}</span>{" "}
                      <span className="muted">
                        requested {formatDate(p.createdAt)}
                        {p.paidAt ? ` · paid ${formatDate(p.paidAt)}` : ""}
                        {p.reference ? ` · ref ${p.reference}` : ""}
                      </span>
                    </p>
                    {p.status === "rejected" && p.note ? <p className="small">{p.note}</p> : null}
                  </div>
                  {p.status === "requested" ? (
                    <div className="notif-item__actions">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => cancel(p.id)}>
                        Cancel request
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">No payouts yet.</p>
          )}
        </section>
      </div>

      <section aria-labelledby="earn-title" className="finance-earnings">
        <h2 id="earn-title">Earnings by order (last 6 months)</h2>
        {finance.earnings.length ? (
          <TableWrap label="Earnings by order">
            <table className="data-table data-table--cards">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Placed</th>
                  <th>Paid by</th>
                  <th>Your earnings</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {finance.earnings.map((e) => (
                  <tr key={e.orderId}>
                    <td>#{e.orderId}</td>
                    <td>{formatDate(e.createdAt)}</td>
                    <td>{e.paidVia}</td>
                    <td className="price">{money(e.net)}</td>
                    <td>{AVAIL_TEXT[e.availability]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <p className="empty">No orders in the last 6 months.</p>
        )}
      </section>
    </>
  );
}

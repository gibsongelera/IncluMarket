"use client";

import { useState } from "react";
import { simulatePaymentAction } from "@/lib/actions/payments-dev";
import { toast } from "@/lib/toast";

/**
 * Development-only payment simulation. PayMongo webhooks cannot reach
 * localhost, so this calls the same handler the real webhook calls. The page
 * renders it only when ENABLE_PAYMENT_SIMULATION=1 in a non-production build,
 * and the action checks both again.
 */
export function AdminPaymentsClient() {
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const id = Number(fd.get("orderId"));
    const outcome = String(fd.get("outcome")) === "failed" ? "failed" : "paid";
    if (!Number.isInteger(id) || id <= 0) return toast("Enter a valid order number.", "error");
    setBusy(true);
    const res = await simulatePaymentAction(id, outcome);
    setBusy(false);
    if (!res.ok) return toast(res.error || "Could not simulate the payment.", "error");
    toast(`Order ${id}: ${outcome} (${res.status}).`, "success");
  }

  return (
    <section className="card setting-row" aria-labelledby="sim-title">
      <h2 id="sim-title">Simulate a payment (development only)</h2>
      <p className="muted">
        PayMongo webhooks cannot reach <code>localhost</code>, so without a tunnel an order never leaves{" "}
        <em>pending</em>. This calls exactly the same handler the real webhook calls. Requires{" "}
        <code>ENABLE_PAYMENT_SIMULATION=1</code> and a non-production build; it is unavailable on the deployed site.
      </p>
      <form className="setting-row__control" onSubmit={submit}>
        <div className="field">
          <label htmlFor="sim-order">Order number</label>
          <input id="sim-order" name="orderId" inputMode="numeric" required />
        </div>
        <div className="field">
          <label htmlFor="sim-outcome">Outcome</label>
          <select id="sim-outcome" name="outcome" defaultValue="paid">
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
          {busy ? "Applying…" : "Apply"}
        </button>
      </form>
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { updatePaymentProvider, type PaymentProviderRow } from "@/lib/actions/payments";
import { simulatePaymentAction } from "@/lib/actions/payments-dev";
import { toast } from "@/lib/toast";

export function AdminPaymentsClient({
  providers,
  simulationEnabled,
}: {
  providers: PaymentProviderRow[];
  simulationEnabled: boolean;
}) {
  const [rows, setRows] = useState(providers);
  const [pending, startTransition] = useTransition();

  function toggle(id: string, enabled: boolean) {
    startTransition(async () => {
      const res = await updatePaymentProvider({ id, enabled });
      if (!res.ok) {
        toast(res.error || "Could not update provider.", "error");
        return;
      }
      setRows((prev) => prev.map((p) => (p.id === id ? { ...p, enabled } : p)));
      toast(`${id} ${enabled ? "enabled" : "disabled"}.`, "success");
    });
  }

  function markConfigured(id: string, publicKey: string) {
    startTransition(async () => {
      const res = await updatePaymentProvider({
        id,
        enabled: true,
        publicKey,
        markConfigured: true,
      });
      if (!res.ok) {
        toast(res.error || "Could not save keys.", "error");
        return;
      }
      setRows((prev) =>
        prev.map((p) => (p.id === id ? { ...p, enabled: true, is_configured: true, public_key: publicKey } : p))
      );
      toast("Provider marked configured (scaffold — live charges need real keys).", "success");
    });
  }

  function simulate(orderId: number, outcome: "paid" | "failed") {
    startTransition(async () => {
      const res = await simulatePaymentAction(orderId, outcome);
      if (!res.ok) {
        toast(res.error || "Could not simulate the payment.", "error");
        return;
      }
      toast(`Order ${orderId}: ${outcome} (${res.status}).`, "success");
    });
  }

  return (
    <div className="stack gap-md">
      <p className="muted">
        <strong>PayMongo</strong> is the live provider. Its Checkout Session already
        offers GCash, Maya, GrabPay and card as payment methods, so those are not
        separate integrations and are shown here disabled for reference only.
        Secret keys live in the environment, never in this form — the field below
        stores a publishable key for display only.
      </p>
      <div className="card-list">
        {rows.map((p) => (
          <article key={p.id} className="card" style={{ padding: "1rem" }}>
            <div className="row between" style={{ alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0 }}>{p.display_name}</h3>
                <p className="muted small" style={{ margin: ".25rem 0 0" }}>
                  {p.is_configured ? "Configured" : "Not configured"} · id: {p.id}
                </p>
              </div>
              <label className="row" style={{ gap: ".5rem", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={p.enabled}
                  disabled={pending}
                  onChange={(e) => toggle(p.id, e.target.checked)}
                  aria-label={`Enable ${p.display_name}`}
                />
                Enabled at checkout
              </label>
            </div>
            <form
              className="row"
              style={{ gap: ".5rem", marginTop: ".75rem", flexWrap: "wrap" }}
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                markConfigured(p.id, String(fd.get("publicKey") || ""));
              }}
            >
              <input
                name="publicKey"
                type="text"
                placeholder="Public / client key (optional)"
                defaultValue={p.public_key || ""}
                style={{ flex: 1, minWidth: "200px" }}
              />
              <button type="submit" className="btn btn--ghost btn--sm" disabled={pending}>
                Save scaffold keys
              </button>
              {p.dashboard_url ? (
                <a className="btn btn--ghost btn--sm" href={p.dashboard_url} target="_blank" rel="noreferrer">
                  Get API keys
                </a>
              ) : null}
            </form>
          </article>
        ))}
      </div>

      {simulationEnabled ? (
        <section className="card" style={{ padding: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>Simulate a payment (development only)</h2>
          <p className="muted">
            PayMongo webhooks cannot reach <code>localhost</code>, so without a tunnel
            an order never leaves <em>pending</em>. This calls exactly the same
            handler the real webhook calls, so the simulated path exercises the real
            code. Requires <code>ENABLE_PAYMENT_SIMULATION=1</code> and a
            non-production build; it is unavailable on the deployed site.
          </p>
          <form
            className="row"
            style={{ gap: ".5rem", flexWrap: "wrap", alignItems: "flex-end" }}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const id = Number(fd.get("orderId"));
              const outcome = String(fd.get("outcome")) === "failed" ? "failed" : "paid";
              if (!Number.isInteger(id) || id <= 0) {
                toast("Enter a valid order number.", "error");
                return;
              }
              simulate(id, outcome);
            }}
          >
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
            <button type="submit" className="btn btn--primary btn--sm" disabled={pending}>
              Apply
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

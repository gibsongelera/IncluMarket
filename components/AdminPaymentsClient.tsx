"use client";

import { useState, useTransition } from "react";
import { updatePaymentProvider, type PaymentProviderRow } from "@/lib/actions/payments";
import { toast } from "@/lib/toast";

export function AdminPaymentsClient({ providers }: { providers: PaymentProviderRow[] }) {
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

  return (
    <div className="stack gap-md">
      <p className="muted">
        Multi-provider payment scaffold (PayMongo, Stripe, PayPal, Maya, GCash). Toggle which methods appear at
        checkout. API key storage is scaffolded — do not paste production secrets into demo environments.
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
    </div>
  );
}

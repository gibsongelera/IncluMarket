"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { saveCounterAccounts } from "@/lib/actions/counter-payments";
import { COUNTER_CHANNELS } from "@/lib/counter-channels";

export interface AccountDraft {
  channel: string;
  accountName: string;
  accountNumber: string;
  instructions: string;
  active: boolean;
}

/**
 * Admin → Payments → The Workshop's accounts (migration 0028): the GCash,
 * Maribank and LandBank accounts buyers pay into. Checkout offers "Pay the
 * Workshop" while at least one is switched on. A row left blank is removed.
 */
export function AdminCounterAccounts({ initial }: { initial: AccountDraft[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<AccountDraft[]>(() =>
    COUNTER_CHANNELS.map(
      (c) =>
        initial.find((a) => a.channel === c.id) ?? { channel: c.id, accountName: "", accountNumber: "", instructions: "", active: false }
    )
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (channel: string, patch: Partial<AccountDraft>) =>
    setRows((rs) => rs.map((r) => (r.channel === channel ? { ...r, ...patch } : r)));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await saveCounterAccounts(rows);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Could not save the accounts.");
      return;
    }
    toast("The Workshop's accounts were saved.", "success");
    router.refresh();
  }

  return (
    <form className="counter-accounts" noValidate onSubmit={onSubmit}>
      {rows.map((r) => {
        const c = COUNTER_CHANNELS.find((x) => x.id === r.channel)!;
        const id = (f: string) => `acct-${r.channel}-${f}`;
        return (
          <fieldset key={r.channel}>
            <legend>{c.label}</legend>
            <div className="field field--check">
              <input
                id={id("active")}
                type="checkbox"
                checked={r.active}
                onChange={(e) => set(r.channel, { active: e.target.checked })}
              />
              <label htmlFor={id("active")}>Offer {c.label} at checkout</label>
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor={id("name")}>Account name</label>
                <input
                  id={id("name")}
                  value={r.accountName}
                  maxLength={120}
                  autoComplete="off"
                  onChange={(e) => set(r.channel, { accountName: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor={id("number")}>Account number</label>
                <input
                  id={id("number")}
                  value={r.accountNumber}
                  maxLength={40}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={id("number-hint")}
                  onChange={(e) => set(r.channel, { accountNumber: e.target.value })}
                />
                <p id={id("number-hint")} className="hint">
                  {r.channel === "gcash" ? "The GCash mobile number, for example 0917 123 4567." : "Digits, letters, spaces and dashes."}
                </p>
              </div>
            </div>
            <div className="field">
              <label htmlFor={id("instructions")}>
                Note for buyers <span className="muted">(optional)</span>
              </label>
              <textarea
                id={id("instructions")}
                rows={2}
                maxLength={500}
                value={r.instructions}
                aria-describedby={id("instructions-hint")}
                onChange={(e) => set(r.channel, { instructions: e.target.value })}
              />
              <p id={id("instructions-hint")} className="hint">
                Shown under the account, for example the branch or what to write in the message field.
              </p>
            </div>
          </fieldset>
        );
      })}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Saving…" : "Save accounts"}
        </button>
      </div>
    </form>
  );
}

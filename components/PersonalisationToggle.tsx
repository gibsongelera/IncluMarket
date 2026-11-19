"use client";

import { useState } from "react";
import { setPersonalization } from "@/lib/actions/account";
import { toast } from "@/lib/toast";

/** Account → Personalised recommendations. A real checkbox; saving is immediate. */
export function PersonalisationToggle({ initial, available }: { initial: boolean; available: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function change(next: boolean) {
    setBusy(true);
    const res = await setPersonalization(next);
    setBusy(false);
    if (!res.ok) return toast(res.error || "Could not save the setting.", "error");
    setOn(next);
    toast(next ? "Personalised recommendations are on." : "Turned off. We deleted the products you viewed.", "success");
  }

  return (
    <section className="card" id="personalisation" aria-labelledby="personalisation-title">
      <h2 id="personalisation-title">Personalised recommendations</h2>
      <p>
        We can suggest products from the categories you viewed, saved or bought. We keep the products you viewed for
        90 days, and only you see the suggestions.
      </p>
      <div className="field field--check">
        <input
          id="personalisation-on"
          type="checkbox"
          checked={on}
          disabled={busy || !available}
          onChange={(e) => change(e.target.checked)}
        />
        <label htmlFor="personalisation-on">Use my activity to recommend products</label>
      </div>
      {!available ? <p className="hint">Available once the latest database update is applied.</p> : null}
    </section>
  );
}

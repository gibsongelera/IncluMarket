"use client";

import { useState } from "react";
import { stopAssist } from "@/lib/actions/assist";
import { toast } from "@/lib/toast";
import { Icon } from "./Icon";

/**
 * The strip under the header on every page while an admin assists a seller
 * (lib/assist): whose shop this is, who is really here, until when, and the
 * way out. It replaces the "Signed in as" strip and, unlike it, shows on
 * phones too. Stopping reloads the page fully, so nothing the router cached
 * as the seller is shown to the admin afterwards.
 */
export function AssistStrip({
  sellerName,
  adminName,
  until,
}: {
  sellerName: string;
  adminName: string;
  /** Already formatted: "4:15 PM". */
  until: string;
}) {
  const [busy, setBusy] = useState(false);

  async function stop() {
    if (busy) return;
    setBusy(true);
    const res = await stopAssist();
    if (!res.ok) {
      setBusy(false);
      toast(res.error || "Could not stop assisting. Please try again.", "error");
      return;
    }
    window.location.assign(res.sellerId ? `/admin/users?q=${res.sellerId}&focus=${res.sellerId}` : "/admin");
  }

  return (
    <section className="assist-strip" aria-label="Assisting a seller">
      <div className="container assist-strip__row">
        <p className="assist-strip__text">
          <Icon name="users" />{" "}
          <strong>Assisting {sellerName}</strong> as {adminName}, until {until}.
          <span className="assist-strip__more"> Everything you do here is logged under your name.</span>
        </p>
        <button
          type="button"
          className="btn btn--primary btn--sm assist-strip__stop"
          onClick={stop}
          aria-disabled={busy || undefined}
        >
          {busy ? "Stopping…" : "Stop assisting"}
        </button>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { exportNewsletter, unsubscribeSubscriber } from "@/lib/actions/admin-content";
import type { Subscriber } from "@/lib/admin-content";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Icon } from "./Icon";
import { ConfirmDialog } from "./ConfirmDialog";
import { TableWrap } from "./TableWrap";

/** Admin → Newsletter (C-40): list, CSV export, manual unsubscribe. */
export function AdminNewsletterClient({ subscribers }: { subscribers: Subscriber[] }) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [removing, setRemoving] = useState<Subscriber | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = showAll ? subscribers : subscribers.filter((s) => !s.unsubscribedAt);

  async function download() {
    setBusy(true);
    const res = await exportNewsletter();
    setBusy(false);
    if (!res.ok || res.csv == null) return toast(res.error || "Could not export the list.", "error");
    // A byte-order mark so spreadsheet apps read names with ñ correctly.
    const url = URL.createObjectURL(new Blob(["﻿", res.csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = res.filename || "newsletter.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`Exported ${res.count ?? 0} subscriber(s).`, "success");
  }

  return (
    <>
      <div className="form-actions form-actions--start">
        <button type="button" className="btn btn--primary" onClick={download} disabled={busy}>
          <Icon name="download" size={16} /> {busy ? "Preparing…" : "Export subscribers (.csv)"}
        </button>
        <span className="field--check">
          <input id="nl-show-all" type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          <label htmlFor="nl-show-all">Show unsubscribed too</label>
        </span>
      </div>

      {list.length === 0 ? (
        <p className="empty">No subscribers yet.</p>
      ) : (
        <TableWrap label="Subscribers">
          <table className="data-table data-table--cards">
            <thead>
              <tr>
                <th>Email</th>
                <th>Subscribed</th>
                <th>From</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} data-row-id={s.id}>
                  <td>{s.email}</td>
                  <td>{formatDate(s.subscribedAt)}</td>
                  <td>{s.source ?? "—"}</td>
                  <td>
                    {s.unsubscribedAt ? (
                      <span className="pill pill--archived">Unsubscribed {formatDate(s.unsubscribedAt)}</span>
                    ) : (
                      <span className="pill pill--active">Subscribed</span>
                    )}
                  </td>
                  <td>
                    {s.unsubscribedAt ? null : (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={busy}
                        onClick={() => {
                          setError(null);
                          setRemoving(s);
                        }}
                      >
                        Unsubscribe…<span className="sr-only"> {s.email}</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        title={`Unsubscribe ${removing?.email ?? ""}?`}
        confirmLabel="Unsubscribe"
        busy={busy}
        error={error}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          setBusy(true);
          const res = await unsubscribeSubscriber(removing.id);
          setBusy(false);
          if (!res.ok) return setError(res.error || "Could not unsubscribe them.");
          setRemoving(null);
          toast("Unsubscribed. They are left out of the next export.", "success");
          router.refresh();
        }}
      >
        <p>Use this when someone asks by email, phone or in person.</p>
      </ConfirmDialog>
    </>
  );
}

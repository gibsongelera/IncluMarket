"use client";

import { useState } from "react";
import { saveNotificationPref } from "@/lib/actions/notifications";
import { toast } from "@/lib/toast";

export interface NotificationSettingRow {
  key: string;
  label: string;
  hint: string;
  inApp: boolean;
  byEmail: boolean;
}

/**
 * Account → Notifications (C-24): per kind, in the app and by email. Each
 * checkbox saves on change. Account and verification notices and order
 * receipts are always sent and are not listed.
 */
export function NotificationSettings({ rows, available }: { rows: NotificationSettingRow[]; available: boolean }) {
  const [state, setState] = useState(rows);
  const [busy, setBusy] = useState<string | null>(null);

  async function change(key: string, channel: "in_app" | "email", on: boolean) {
    setBusy(`${key}:${channel}`);
    const res = await saveNotificationPref(key, channel, on);
    setBusy(null);
    if (!res.ok) return toast(res.error || "Could not save the setting.", "error");
    setState((list) => list.map((r) => (r.key === key ? { ...r, [channel === "in_app" ? "inApp" : "byEmail"]: on } : r)));
    toast("Saved.", "success");
  }

  return (
    <div className="notif-settings">
      {!available ? <p className="notice notice--info">These settings need the latest database update.</p> : null}
      <table className="data-table notif-settings__table">
        <caption className="sr-only">Notification settings</caption>
        <thead>
          <tr>
            <th scope="col">Kind</th>
            <th scope="col">In the app</th>
            <th scope="col">By email</th>
          </tr>
        </thead>
        <tbody>
          {state.map((r) => (
            <tr key={r.key}>
              <th scope="row">
                {r.label}
                <div className="hint">{r.hint}</div>
              </th>
              <td>
                <label className="radio">
                  <input
                    type="checkbox"
                    checked={r.inApp}
                    disabled={!available || busy === `${r.key}:in_app`}
                    onChange={(e) => change(r.key, "in_app", e.target.checked)}
                  />
                  <span className="sr-only">{r.label} in the app</span>
                  <span aria-hidden="true">{r.inApp ? "On" : "Off"}</span>
                </label>
              </td>
              <td>
                <label className="radio">
                  <input
                    type="checkbox"
                    checked={r.byEmail}
                    disabled={!available || busy === `${r.key}:email`}
                    onChange={(e) => change(r.key, "email", e.target.checked)}
                  />
                  <span className="sr-only">{r.label} by email</span>
                  <span aria-hidden="true">{r.byEmail ? "On" : "Off"}</span>
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        Always sent: order receipts, account and PWD verification notices, and listing review decisions.
      </p>
    </div>
  );
}

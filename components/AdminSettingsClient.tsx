"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSetting } from "@/lib/actions/admin-content";
import type { AdminSetting } from "@/lib/admin-content";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";

/** Admin → Settings (C-40): one small form per value, saved on its own. */
export function AdminSettingsClient({ settings }: { settings: AdminSetting[] }) {
  const groups = [...new Set(settings.map((s) => s.group))];
  return (
    <>
      {groups.map((g) => (
        <section key={g} className="settings-group" aria-labelledby={`set-${g.replace(/\W+/g, "-")}`}>
          <h2 id={`set-${g.replace(/\W+/g, "-")}`}>{g}</h2>
          {settings
            .filter((s) => s.group === g)
            .map((s) => (
              <SettingRow key={s.key} setting={s} />
            ))}
        </section>
      ))}
    </>
  );
}

function SettingRow({ setting: s }: { setting: AdminSetting }) {
  const router = useRouter();
  const [value, setValue] = useState(String(s.value));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = value.trim() !== String(s.value);
  const inputId = `setting-${s.key}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await saveSetting(s.key, Number(value));
    setBusy(false);
    if (!res.ok) return setError(res.error || "Could not save it.");
    toast(`${s.label} saved.`, "success");
    router.refresh();
  }

  return (
    <form className="card setting-row" onSubmit={submit} noValidate>
      <p>
        <label htmlFor={inputId}>
          <strong>{s.label}</strong>
        </label>
      </p>
      <p className="hint" id={`${inputId}-hint`}>
        {s.help} Allowed: {s.min} to {s.max}. Default: {s.default}.
      </p>
      <div className="setting-row__control">
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={s.min}
          max={s.max}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ""}`}
          aria-invalid={error ? true : undefined}
        />
        <span>{s.unit}</span>
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !changed}>
          {busy ? "Saving…" : "Save"}
          <span className="sr-only"> {s.label}</span>
        </button>
      </div>
      {error ? (
        <p className="field-error" id={`${inputId}-error`} role="alert">
          {error}
        </p>
      ) : null}
      <p className="small muted">
        {s.stored && s.updatedAt
          ? `Last changed ${formatDateTime(s.updatedAt)}${s.updatedBy ? ` by ${s.updatedBy}` : ""}.`
          : s.stored
            ? "Set when the database was created."
            : "Using the default."}
      </p>
    </form>
  );
}

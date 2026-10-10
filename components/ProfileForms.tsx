"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changePassword, updateProfile } from "@/lib/actions/account";
import { toast } from "@/lib/toast";

/** Account → Profile: name and phone, then the password (C-30). */
export function ProfileForms({ name, phone, email }: { name: string; phone: string | null; email: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ name, phone: phone ?? "" });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState<"profile" | "password" | null>(null);
  const [err, setErr] = useState<{ form: "profile" | "password"; field?: string; text: string } | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy("profile");
    setErr(null);
    const res = await updateProfile(form);
    setBusy(null);
    if (!res.ok) return setErr({ form: "profile", field: res.field, text: res.error || "Could not save." });
    toast("Profile saved.", "success");
    router.refresh();
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.next !== pw.confirm) return setErr({ form: "password", field: "confirm", text: "The two new passwords do not match." });
    setBusy("password");
    const res = await changePassword(pw.current, pw.next);
    setBusy(null);
    if (!res.ok) return setErr({ form: "password", field: res.field, text: res.error || "Could not change it." });
    setPw({ current: "", next: "", confirm: "" });
    toast("Password changed.", "success");
  }

  const invalid = (formName: "profile" | "password", field: string) =>
    err?.form === formName && err.field === field ? true : undefined;

  return (
    <div className="account-grid">
      <form className="card form" onSubmit={saveProfile} noValidate aria-labelledby="pf-title">
        <h2 id="pf-title">Your details</h2>
        <div className="field">
          <label htmlFor="pf-name">Name</label>
          <input
            id="pf-name"
            autoComplete="name"
            value={form.name}
            aria-invalid={invalid("profile", "name")}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="pf-phone">
            Phone <span className="muted">(optional)</span>
          </label>
          <input
            id="pf-phone"
            inputMode="tel"
            autoComplete="tel"
            value={form.phone}
            aria-invalid={invalid("profile", "phone")}
            aria-describedby="pf-phone-hint"
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <p className="hint" id="pf-phone-hint">
            For example 09171234567.
          </p>
        </div>
        <div className="field">
          <span className="field__label">Email</span>
          <p className="mono">{email}</p>
          <p className="hint">To change your email, contact us from the Contact page.</p>
        </div>
        {err?.form === "profile" ? (
          <p className="form-error" role="alert">
            {err.text}
          </p>
        ) : null}
        <div className="form-actions form-actions--start">
          <button type="submit" className="btn btn--primary" disabled={busy === "profile"}>
            {busy === "profile" ? "Saving…" : "Save details"}
          </button>
        </div>
      </form>

      <form className="card form" onSubmit={savePassword} noValidate aria-labelledby="pw-title">
        <h2 id="pw-title">Password</h2>
        <div className="field">
          <label htmlFor="pw-current">Current password</label>
          <input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            value={pw.current}
            aria-invalid={invalid("password", "current")}
            onChange={(e) => setPw({ ...pw, current: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="pw-next">New password</label>
          <input
            id="pw-next"
            type="password"
            autoComplete="new-password"
            value={pw.next}
            aria-invalid={invalid("password", "next")}
            aria-describedby="pw-next-hint"
            onChange={(e) => setPw({ ...pw, next: e.target.value })}
          />
          <p className="hint" id="pw-next-hint">
            At least 8 characters, with a letter and a number. Pasting from a password manager is fine.
          </p>
        </div>
        <div className="field">
          <label htmlFor="pw-confirm">New password again</label>
          <input
            id="pw-confirm"
            type="password"
            autoComplete="new-password"
            value={pw.confirm}
            aria-invalid={invalid("password", "confirm")}
            onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
          />
        </div>
        {err?.form === "password" ? (
          <p className="form-error" role="alert">
            {err.text}
          </p>
        ) : null}
        <div className="form-actions form-actions--start">
          <button type="submit" className="btn btn--primary" disabled={busy === "password"}>
            {busy === "password" ? "Changing…" : "Change password"}
          </button>
        </div>
      </form>
    </div>
  );
}

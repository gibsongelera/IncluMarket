"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitPrivacyRequest } from "@/lib/actions/account";
import { setMyNewsletter } from "@/lib/actions/newsletter";
import type { PrivacyRequestLite } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

const KINDS = [
  { value: "access", label: "Send me a copy of my personal data" },
  { value: "correction", label: "Correct something in my personal data" },
  { value: "deletion", label: "Delete my personal data and account" },
  { value: "objection", label: "Stop a use of my personal data" },
];
const STATUS: Record<string, string> = { open: "Received", in_progress: "Being handled", done: "Done", rejected: "Declined" };

/** Account → Privacy (C-30, C-42, RA 10173). */
export function PrivacyCentre({
  newsletter,
  requests,
}: {
  newsletter: boolean;
  /** null before migration 0019. */
  requests: PrivacyRequestLite[] | null;
}) {
  const router = useRouter();
  const [subscribed, setSubscribed] = useState(newsletter);
  const [kind, setKind] = useState("access");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleNewsletter(on: boolean) {
    setBusy("newsletter");
    const res = await setMyNewsletter(on);
    setBusy(null);
    if (!res.ok) return toast(res.error || "Could not update.", "error");
    setSubscribed(on);
    toast(on ? "Subscribed. We sent a welcome email." : "Unsubscribed from the newsletter.", "success");
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy("request");
    setError(null);
    const res = await submitPrivacyRequest(kind, details);
    setBusy(null);
    if (!res.ok) return setError(res.error || "Could not send your request.");
    setDetails("");
    toast("Request sent. We emailed you a confirmation and will reply within 15 days.", "success");
    router.refresh();
  }

  return (
    <div className="account-grid">
      <section className="card" aria-labelledby="nl-title">
        <h2 id="nl-title">Newsletter</h2>
        <p>Occasional emails about new PWD-made products and flash sales. You can stop them at any time.</p>
        <div className="field field--check">
          <input
            id="nl-on"
            type="checkbox"
            checked={subscribed}
            disabled={busy === "newsletter"}
            onChange={(e) => toggleNewsletter(e.target.checked)}
          />
          <label htmlFor="nl-on">Email me the newsletter</label>
        </div>
      </section>

      <section className="card" aria-labelledby="pr-title">
        <h2 id="pr-title">Your data</h2>
        <p>
          Under the Data Privacy Act (RA 10173) you can ask for a copy of your data, a correction, deletion, or that we
          stop a use of it. We reply within 15 days. Read the <Link href="/privacy">Privacy Policy</Link>.
        </p>
        {requests === null ? (
          <p className="notice notice--info">
            Requests from your account need the latest database update. Until then, use the <Link href="/contact">Contact page</Link>.
          </p>
        ) : (
          <form className="form" onSubmit={send} noValidate>
            <fieldset className="radio-group">
              <legend>What would you like?</legend>
              {KINDS.map((k) => (
                <label key={k.value} className="radio">
                  <input type="radio" name="privacy-kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} />
                  {k.label}
                </label>
              ))}
            </fieldset>
            <div className="field">
              <label htmlFor="pr-details">
                Details {kind === "correction" || kind === "objection" ? "" : <span className="muted">(optional)</span>}
              </label>
              <textarea id="pr-details" rows={3} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} />
            </div>
            {kind === "deletion" ? (
              <p className="hint">
                We keep order records the law requires (for taxes and disputes) and remove or anonymise the rest.
              </p>
            ) : null}
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="form-actions form-actions--start">
              <button type="submit" className="btn btn--primary" disabled={busy === "request"}>
                {busy === "request" ? "Sending…" : "Send request"}
              </button>
            </div>
          </form>
        )}
        {requests?.length ? (
          <>
            <h3 className="order-detail__subhead">Your requests</h3>
            <ul className="notif-list" role="list">
              {requests.map((r) => (
                <li key={r.id} className="notif-item">
                  <div className="notif-item__body">
                    <p className="notif-item__title">
                      #{r.id} · {KINDS.find((k) => k.value === r.kind)?.label ?? r.kind}
                    </p>
                    <p className="muted small">
                      Sent {formatDate(r.createdAt)} · {STATUS[r.status] ?? r.status}
                      {r.handledAt ? ` · ${formatDate(r.handledAt)}` : ""}
                    </p>
                    {r.response ? <p className="small">{r.response}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { submitContactMessage } from "@/lib/actions/contact";
import { CONTACT_RETENTION_DAYS, CONTACT_TOPICS } from "@/lib/site";

/**
 * The contact form (C-41). Errors show next to the form and move focus to
 * the summary; success replaces the form with a plain confirmation, so a
 * screen reader user hears what happened.
 */
export function ContactForm({ name: defaultName = "", email: defaultEmail = "" }: { name?: string; email?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await submitContactMessage({
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      topic: String(fd.get("topic") ?? ""),
      message: String(fd.get("message") ?? ""),
      consent: fd.get("consent") === "on",
      website: String(fd.get("website") ?? ""),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Could not send your message.");
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setSent(true);
    requestAnimationFrame(() => doneRef.current?.focus());
  }

  if (sent) {
    return (
      <div className="notice notice--success" ref={doneRef} tabIndex={-1} role="status">
        <p>
          <strong>Message sent.</strong> We reply by email, usually within two working days.
        </p>
      </div>
    );
  }

  return (
    <form className="form contact-form" onSubmit={onSubmit} noValidate aria-describedby={error ? "contact-error" : undefined}>
      {error ? (
        <p className="form-error" id="contact-error" role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      ) : null}
      <div className="field">
        <label htmlFor="ct-name">Your name</label>
        <input id="ct-name" name="name" autoComplete="name" maxLength={120} defaultValue={defaultName} required />
      </div>
      <div className="field">
        <label htmlFor="ct-email">Email for our reply</label>
        <input
          id="ct-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          defaultValue={defaultEmail}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="ct-topic">What is it about?</label>
        <select id="ct-topic" name="topic" defaultValue="question">
          {CONTACT_TOPICS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="ct-message">Message</label>
        <textarea id="ct-message" name="message" rows={6} maxLength={4000} required />
      </div>
      {/* Honeypot for bots: hidden from people and from assistive technology. */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="ct-website">Leave this empty</label>
        <input id="ct-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="field field--check">
        <input id="ct-consent" name="consent" type="checkbox" required />
        <label htmlFor="ct-consent">
          InclusiveMarket may keep my name, email and message for up to {CONTACT_RETENTION_DAYS / 365} year to answer
          me. See the <a href="/privacy">Privacy Policy</a>.
        </label>
      </div>
      <div className="form-actions form-actions--start">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}

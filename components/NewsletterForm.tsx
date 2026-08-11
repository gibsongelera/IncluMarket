"use client";

import { useState } from "react";
import { subscribeNewsletter } from "@/lib/actions/newsletter";
import { toast } from "@/lib/toast";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await subscribeNewsletter(email);
    setBusy(false);
    if (!res.ok) {
      toast(res.error || "Could not subscribe.", "error");
      return;
    }
    toast("Subscribed. Watch your inbox for updates.", "success");
    setEmail("");
  }

  return (
    <form className="newsletter-form" onSubmit={onSubmit}>
      <label htmlFor="newsletter-email" className="sr-only">
        Email address
      </label>
      <input
        id="newsletter-email"
        type="email"
        required
        placeholder="you@example.com"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
        Subscribe
      </button>
    </form>
  );
}

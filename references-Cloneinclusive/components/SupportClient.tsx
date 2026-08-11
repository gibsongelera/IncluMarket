"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Pill } from "./Pill";
import { createTicket } from "@/lib/actions/shop";
import type { Priority, SupportTicket, TicketResponse } from "@/lib/types";

export function SupportClient({
  tickets,
  responses,
}: {
  tickets: SupportTicket[];
  responses: TicketResponse[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const data = new FormData(form);
    setBusy(true);
    const res = await createTicket(
      String(data.get("subject") || ""),
      String(data.get("description") || ""),
      (String(data.get("priority") || "medium") as Priority)
    );
    setBusy(false);
    if (!res.ok) {
      toast(res.error || "Could not submit ticket.", "error");
      return;
    }
    toast("Ticket submitted.", "success");
    form.reset();
    router.refresh();
  }

  return (
    <div className="support-grid">
      <section aria-labelledby="new-ticket-title">
        <h2 id="new-ticket-title">Open a new ticket</h2>
        <form id="ticket-form" className="form" noValidate ref={formRef} onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="tk-subject">Subject</label>
            <input id="tk-subject" name="subject" required maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="tk-priority">Priority</label>
            <select id="tk-priority" name="priority" defaultValue="medium">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="tk-desc">Describe the issue</label>
            <textarea id="tk-desc" name="description" rows={5} required></textarea>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              Submit ticket
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="my-tickets-title">
        <h2 id="my-tickets-title">My tickets</h2>
        {tickets.length === 0 ? (
          <p className="empty">You have no tickets yet.</p>
        ) : (
          <div id="my-tickets">
            {tickets.map((t) => {
              const thread = responses
                .filter((r) => r.ticket_id === t.id)
                .sort((a, b) => a.created_at.localeCompare(b.created_at));
              return (
                <article className="ticket-card" key={t.id}>
                  <header>
                    <strong>
                      #{t.id} &middot; {t.subject}
                    </strong>
                    <Pill status={t.ticket_status} />
                  </header>
                  <p className="muted small">
                    Priority: {t.priority_level} &middot; {formatDateTime(t.created_at)}
                  </p>
                  <div className="thread">
                    {thread.map((r) => (
                      <div key={r.id} className={`msg ${r.author_role === "admin" ? "msg--admin" : ""}`}>
                        <header>
                          <span>{r.author_role}</span>
                          <span>{formatDateTime(r.created_at)}</span>
                        </header>
                        <div>{r.message}</div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

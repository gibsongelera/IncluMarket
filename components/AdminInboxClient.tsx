"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { respondPrivacyRequest, setContactStatus } from "@/lib/actions/admin-content";
import type { AdminPrivacyRequest, ContactMessage } from "@/lib/admin-content";
import { formatDate, formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "./ConfirmDialog";

const KIND_TEXT: Record<AdminPrivacyRequest["kind"], string> = {
  access: "Copy of their data",
  correction: "Correct their data",
  deletion: "Delete their data",
  objection: "Stop a use of their data",
};

const PRIVACY_STATUS_TEXT: Record<AdminPrivacyRequest["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Completed",
  rejected: "Refused",
};

const PRIVACY_PILL: Record<AdminPrivacyRequest["status"], string> = {
  open: "open",
  in_progress: "in_progress",
  done: "resolved",
  rejected: "rejected",
};

type Answer = "in_progress" | "done" | "rejected";

/** Data-subject requests (RA 10173), answered within 15 days. */
export function PrivacyRequestsClient({ requests }: { requests: AdminPrivacyRequest[] }) {
  const router = useRouter();
  const [answering, setAnswering] = useState<AdminPrivacyRequest | null>(null);
  const [status, setStatus] = useState<Answer>("done");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!requests.length) return <p className="empty">No privacy requests.</p>;

  return (
    <>
      <ul className="inbox-list" role="list">
        {requests.map((r) => {
          const closed = r.status === "done" || r.status === "rejected";
          const overdue = !closed && Date.parse(r.dueAt) < Date.now();
          return (
            <li key={r.id} className="card inbox-item" data-row-id={r.id}>
              <p>
                <strong>
                  #{r.id} · {KIND_TEXT[r.kind]}
                </strong>{" "}
                <span className={`pill pill--${PRIVACY_PILL[r.status]}`}>{PRIVACY_STATUS_TEXT[r.status]}</span>
              </p>
              <p className="small muted">
                {r.requester}
                {r.requesterEmail ? ` · ${r.requesterEmail}` : ""} · sent {formatDateTime(r.createdAt)}
              </p>
              {closed ? null : (
                <p className={overdue ? "field-error small" : "small"}>
                  {overdue ? "Overdue — " : ""}answer by {formatDate(r.dueAt)}
                </p>
              )}
              {r.details ? <p className="inbox-item__text">{r.details}</p> : null}
              {r.response ? (
                <p className="small">
                  Our answer{r.handledAt ? ` (${formatDateTime(r.handledAt)})` : ""}: {r.response}
                </p>
              ) : null}
              {closed ? null : (
                <p className="inbox-item__actions">
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={() => {
                      setError(null);
                      setStatus("done");
                      setAnswering(r);
                    }}
                  >
                    Answer…<span className="sr-only"> request {r.id}</span>
                  </button>
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={Boolean(answering)}
        title={`Answer request #${answering?.id ?? ""}`}
        confirmLabel={status === "in_progress" ? "Save" : "Send answer"}
        busy={busy}
        error={error}
        reason={{
          label: "Answer to the requester",
          required: status !== "in_progress",
          minLength: status !== "in_progress" ? 10 : undefined,
          maxLength: 2000,
          hint: "They read this in the app and by email. Say what you did, or why you cannot, and what they can do next.",
        }}
        onCancel={() => setAnswering(null)}
        onConfirm={async (text) => {
          if (!answering) return;
          setBusy(true);
          const res = await respondPrivacyRequest(answering.id, status, text);
          setBusy(false);
          if (!res.ok) return setError(res.error || "Could not save the answer.");
          setAnswering(null);
          toast(status === "in_progress" ? "Marked in progress." : "Answer sent.", "success");
          router.refresh();
        }}
      >
        <p>
          {answering ? KIND_TEXT[answering.kind] : ""}
          {answering?.details ? `: ${answering.details}` : ""}
        </p>
        <fieldset className="radio-group">
          <legend>Status</legend>
          {(["in_progress", "done", "rejected"] as Answer[]).map((s) => (
            <label key={s}>
              <input type="radio" name="privacy-status" value={s} checked={status === s} onChange={() => setStatus(s)} />{" "}
              {s === "in_progress" ? "Working on it" : s === "done" ? "Completed" : "Cannot do this"}
            </label>
          ))}
        </fieldset>
      </ConfirmDialog>
    </>
  );
}

const TOPIC_TEXT: Record<string, string> = {
  question: "Question",
  order: "An order",
  selling: "Selling",
  accessibility: "Accessibility",
  privacy: "Privacy",
  other: "Other",
};

const CONTACT_PILL: Record<ContactMessage["status"], string> = { new: "open", answered: "resolved", closed: "archived" };
const CONTACT_TEXT: Record<ContactMessage["status"], string> = { new: "New", answered: "Answered", closed: "Closed" };

/** The public contact form's inbox. Replies go from the admin's own mail app. */
export function ContactInboxClient({ messages }: { messages: ContactMessage[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);

  async function mark(m: ContactMessage, status: ContactMessage["status"]) {
    setBusy(m.id);
    const res = await setContactStatus(m.id, status);
    setBusy(null);
    if (!res.ok) return toast(res.error || "Could not update it.", "error");
    toast(`Message from ${m.name} marked ${CONTACT_TEXT[status].toLowerCase()}.`, "success");
    router.refresh();
  }

  if (!messages.length) return <p className="empty">No messages yet.</p>;

  return (
    <ul className="inbox-list" role="list">
      {messages.map((m) => (
        <li key={m.id} className="card inbox-item" data-row-id={m.id}>
          <p>
            <strong>{TOPIC_TEXT[m.topic] ?? m.topic}</strong> from {m.name}{" "}
            <span className={`pill pill--${CONTACT_PILL[m.status]}`}>{CONTACT_TEXT[m.status]}</span>
          </p>
          <p className="small muted">
            {m.email} · {formatDateTime(m.createdAt)}
            {m.signedIn ? " · signed in" : " · guest"}
          </p>
          <p className="inbox-item__text">{m.message}</p>
          <p className="inbox-item__actions">
            <a
              className="btn btn--outline btn--sm"
              href={`mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent("Re: your message to InclusiveMarket")}`}
            >
              Reply by email<span className="sr-only"> to {m.name}</span>
            </a>
            {m.status !== "answered" ? (
              <button type="button" className="btn btn--ghost btn--sm" disabled={busy === m.id} onClick={() => mark(m, "answered")}>
                Mark answered
              </button>
            ) : null}
            {m.status !== "closed" ? (
              <button type="button" className="btn btn--ghost btn--sm" disabled={busy === m.id} onClick={() => mark(m, "closed")}>
                Close
              </button>
            ) : (
              <button type="button" className="btn btn--ghost btn--sm" disabled={busy === m.id} onClick={() => mark(m, "new")}>
                Reopen
              </button>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}

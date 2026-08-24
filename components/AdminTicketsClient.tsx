"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatDateTime, maskEmail } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Pill } from "./Pill";
import { addAdminTicketResponse, setTicketStatus } from "@/lib/actions/admin";
import type { SupportTicket, TicketResponse, TicketStatus } from "@/lib/types";
import { Tabs, TabPanel } from "./Tabs";

type UserLite = { id: number; name: string; email: string };
const TABS = [
  { status: "open", label: "Open" },
  { status: "in_progress", label: "In progress" },
  { status: "resolved", label: "Resolved" },
  { status: "all", label: "All" },
];

export function AdminTicketsClient({
  tickets,
  responses,
  users,
}: {
  tickets: SupportTicket[];
  responses: TicketResponse[];
  users: UserLite[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("open");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const all = tickets.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return filter === "all" ? all : all.filter((t) => t.ticket_status === filter);
  }, [tickets, filter]);

  const active = useMemo(() => {
    const id = activeId ?? (list[0] ? list[0].id : null);
    return list.find((t) => t.id === id) || tickets.find((t) => t.id === id) || null;
  }, [activeId, list, tickets]);

  const userById = (id: number) => users.find((u) => u.id === id);

  async function sendReply() {
    if (!active) return;
    const msg = reply.trim();
    if (!msg) {
      toast("Please write a reply.", "warning");
      return;
    }
    setBusy(true);
    const res = await addAdminTicketResponse(active.id, msg);
    setBusy(false);
    if (!res.ok) {
      toast(res.error || "Could not send reply.", "error");
      return;
    }
    toast("Reply sent.", "success");
    setReply("");
    router.refresh();
  }

  async function changeStatus(status: TicketStatus) {
    if (!active) return;
    const res = await setTicketStatus(active.id, status);
    if (!res.ok) {
      toast(res.error || "Could not update.", "error");
      return;
    }
    toast(`Ticket #${active.id} set to "${status}".`, "success");
    router.refresh();
  }

  return (
    <>
      <Tabs
        idPrefix="tk"
        label="Ticket status"
        value={filter}
        onChange={(next) => {
          setFilter(next);
          setActiveId(null);
        }}
        items={TABS.map((t) => ({ value: t.status, label: t.label }))}
      />

      <TabPanel idPrefix="tk" value={filter}>
      <div className="ticket-workspace">
        {/* Was role="list" with <button> children, which is invalid — children
            of a list must be listitem, and putting listitem on a button would
            strip the button role. It is really a scrollable panel of controls,
            so it is a named, focusable region instead (it has max-height with
            overflow-y, and was previously unreachable by keyboard). */}
        <div
          className="ticket-list scroll-region"
          id="ticket-list"
          tabIndex={0}
          role="region"
          aria-label="Tickets"
        >
          {list.length === 0 ? (
            <p className="empty">No tickets in this status.</p>
          ) : (
            list.map((t) => {
              const user = userById(t.user_id);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`ticket-list__item ${active?.id === t.id ? "is-active" : ""}`}
                  onClick={() => setActiveId(t.id)}
                >
                  <strong>
                    #{t.id} &middot; {t.subject}
                  </strong>
                  <small>
                    {user ? user.name : "User"} &middot; {formatDate(t.updated_at)}
                  </small>
                  <div style={{ marginTop: ".35rem" }}>
                    <Pill status={t.ticket_status} /> <span className="badge">{t.priority_level}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <section className="ticket-detail" id="ticket-detail" aria-live="polite">
          {!active ? (
            <p className="muted">Select a ticket to view details.</p>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <h2 style={{ margin: 0 }}>
                  #{active.id} &middot; {active.subject}
                </h2>
                <Pill status={active.ticket_status} />
              </div>
              <p className="muted small">
                From <strong>{userById(active.user_id)?.name || "User"}</strong> (
                {maskEmail(userById(active.user_id)?.email || "")}) &middot; Priority: {active.priority_level}{" "}
                &middot; Opened {formatDateTime(active.created_at)}
              </p>

              <div className="thread">
                {responses.filter((r) => r.ticket_id === active.id).length === 0 ? (
                  <p className="muted">No messages yet.</p>
                ) : (
                  responses
                    .filter((r) => r.ticket_id === active.id)
                    .sort((a, b) => a.created_at.localeCompare(b.created_at))
                    .map((r) => (
                      <div key={r.id} className={`msg ${r.author_role === "admin" ? "msg--admin" : ""}`}>
                        <header>
                          <span>{r.author_role}</span>
                          <span>{formatDateTime(r.created_at)}</span>
                        </header>
                        <div>{r.message}</div>
                      </div>
                    ))
                )}
              </div>

              <div className="form" style={{ marginTop: ".75rem" }}>
                <div className="field">
                  <label htmlFor="reply">Reply</label>
                  <textarea
                    id="reply"
                    rows={3}
                    placeholder="Type a reply to the user…"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  ></textarea>
                </div>
                <div className="form-actions">
                  <button className="btn btn--primary" id="reply-send" disabled={busy} onClick={sendReply}>
                    Send reply
                  </button>
                  <button className="btn btn--ghost" onClick={() => changeStatus("in_progress")}>
                    Mark in-progress
                  </button>
                  <button className="btn btn--ghost" onClick={() => changeStatus("resolved")}>
                    Mark resolved
                  </button>
                  <button className="btn btn--ghost" onClick={() => changeStatus("open")}>
                    Re-open
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
      </TabPanel>
    </>
  );
}

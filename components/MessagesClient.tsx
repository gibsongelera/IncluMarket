"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { sendMessage, markConversationRead } from "@/lib/actions/messages";
import type { Conversation, Message, Role } from "@/lib/types";

type ParticipantLite = { id: number; name: string };

export function MessagesClient({
  viewerRole,
  viewerId,
  conversations,
  messages,
  participants,
  initialConversationId,
}: {
  viewerRole: Role;
  viewerId: number;
  conversations: Conversation[];
  messages: Record<number, Message[]>;
  participants: ParticipantLite[];
  initialConversationId?: number | null;
}) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<number | null>(initialConversationId ?? null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(
    () => conversations.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [conversations]
  );
  const active = useMemo(() => {
    const id = activeId ?? (sorted[0] ? sorted[0].id : null);
    return sorted.find((c) => c.id === id) || null;
  }, [activeId, sorted]);

  function otherPartyId(c: Conversation) {
    return viewerRole === "buyer" ? c.seller_id : c.buyer_id;
  }
  function nameFor(id: number) {
    return participants.find((p) => p.id === id)?.name || (viewerRole === "buyer" ? "Seller" : "Buyer");
  }
  function hasUnread(c: Conversation) {
    return (messages[c.id] || []).some((m) => m.sender_id !== viewerId && !m.read_at);
  }

  async function openConversation(id: number) {
    setActiveId(id);
    const convo = sorted.find((c) => c.id === id);
    if (convo && hasUnread(convo)) {
      await markConversationRead(id);
      router.refresh();
    }
  }

  async function send() {
    if (!active) return;
    const text = reply.trim();
    if (!text) {
      toast("Write a message first.", "warning");
      return;
    }
    setBusy(true);
    const res = await sendMessage(active.id, text);
    setBusy(false);
    if (!res.ok) {
      toast(res.error || "Could not send message.", "error");
      return;
    }
    setReply("");
    router.refresh();
  }

  return (
    <div className="ticket-workspace">
      <div className="ticket-list" role="list" aria-label="Conversations">
        {sorted.length === 0 ? (
          <p className="empty">No conversations yet.</p>
        ) : (
          sorted.map((c) => {
            const thread = messages[c.id] || [];
            const last = thread[thread.length - 1];
            return (
              <button
                key={c.id}
                type="button"
                className={`ticket-list__item ${active?.id === c.id ? "is-active" : ""}`}
                onClick={() => openConversation(c.id)}
              >
                <strong>
                  {nameFor(otherPartyId(c))}
                  {hasUnread(c) ? <span className="badge badge--red"> New</span> : null}
                </strong>
                <small>{last ? last.body.slice(0, 60) : "No messages yet"}</small>
              </button>
            );
          })
        )}
      </div>

      <section className="ticket-detail" aria-live="polite">
        {!active ? (
          <p className="muted">Select a conversation to view messages.</p>
        ) : (
          <>
            <h2 style={{ margin: 0 }}>{nameFor(otherPartyId(active))}</h2>
            <div className="thread">
              {(messages[active.id] || []).length === 0 ? (
                <p className="muted">No messages yet. Say hello.</p>
              ) : (
                (messages[active.id] || []).map((m) => (
                  <div key={m.id} className={`msg ${m.sender_id === viewerId ? "msg--admin" : ""}`}>
                    <header>
                      <span>{m.sender_id === viewerId ? "You" : nameFor(otherPartyId(active))}</span>
                      <span>{formatDateTime(m.created_at)}</span>
                    </header>
                    <div>{m.body}</div>
                  </div>
                ))
              )}
            </div>

            <div className="form" style={{ marginTop: ".75rem" }}>
              <div className="field">
                <label htmlFor="msg-reply">Message</label>
                <textarea
                  id="msg-reply"
                  rows={3}
                  placeholder="Type a message…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                ></textarea>
              </div>
              <div className="form-actions">
                <button className="btn btn--primary" disabled={busy} onClick={send}>
                  Send
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

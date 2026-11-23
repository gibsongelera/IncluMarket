"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { toJpeg } from "@/lib/image-client";
import { sendMessage, sendMessagePhoto, markConversationRead } from "@/lib/actions/messages";
import { Icon } from "./Icon";
import type { Conversation, Message, Role } from "@/lib/types";

type ParticipantLite = { id: number; name: string };
type Photo = { blob: Blob; preview: string };

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
  // One photo per message: resized and re-encoded in the browser (no EXIF or
  // GPS), then checked again on the server before it is stored privately.
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [alt, setAlt] = useState("");
  const [preparing, setPreparing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const addPhotoRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.preview);
  }, [photo]);

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
  function preview(m: Message | undefined) {
    if (!m) return "No messages yet";
    if (m.body) return m.body.slice(0, 60);
    return m.has_photo ? "Photo" : "";
  }

  async function openConversation(id: number) {
    setActiveId(id);
    const convo = sorted.find((c) => c.id === id);
    if (convo && hasUnread(convo)) {
      await markConversationRead(id);
      router.refresh();
    }
  }

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setPreparing(true);
    try {
      const blob = await toJpeg(file, 1600, 1_000_000);
      setPhoto({ blob, preview: URL.createObjectURL(blob) });
    } catch {
      toast("That photo could not be used. Try a JPEG or PNG photo.", "error");
    } finally {
      setPreparing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removePhoto() {
    setPhoto(null);
    setAlt("");
    // "Add a photo" comes back on the next render; put focus on it then.
    requestAnimationFrame(() => addPhotoRef.current?.focus());
  }

  async function send() {
    if (!active) return;
    const text = reply.trim();
    if (!text && !photo) {
      toast("Write a message or add a photo first.", "warning");
      return;
    }
    setBusy(true);
    let res;
    if (photo) {
      const form = new FormData();
      form.set("conversationId", String(active.id));
      form.set("body", text);
      form.set("alt", alt.trim());
      form.set("photo", new File([photo.blob], "photo.jpg", { type: "image/jpeg" }));
      res = await sendMessagePhoto(form);
    } else {
      res = await sendMessage(active.id, text);
    }
    setBusy(false);
    if (!res.ok) {
      toast(res.error || "Could not send message.", "error");
      return;
    }
    setReply("");
    setPhoto(null);
    setAlt("");
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
                <small>{preview(last)}</small>
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
                (messages[active.id] || []).map((m) => {
                  const from = m.sender_id === viewerId ? "You" : nameFor(otherPartyId(active));
                  return (
                    <div key={m.id} className={`msg ${m.sender_id === viewerId ? "msg--admin" : ""}`}>
                      <header>
                        <span>{from}</span>
                        <span>{formatDateTime(m.created_at)}</span>
                      </header>
                      {m.has_photo ? (
                        m.image_url ? (
                          <a className="msg__photo" href={m.image_url} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={m.image_url} alt={m.image_alt || `Photo from ${from === "You" ? "you" : from}`} />
                            <span className="sr-only"> (opens full size in a new tab)</span>
                          </a>
                        ) : (
                          <p className="msg__photo-missing">Photo unavailable. Reload the page to see it.</p>
                        )
                      ) : null}
                      {m.body ? <div>{m.body}</div> : null}
                    </div>
                  );
                })
              )}
            </div>

            <div className="form msg-compose" style={{ marginTop: ".75rem" }}>
              <div className="field">
                <label htmlFor="msg-reply">Message{photo ? " (optional)" : ""}</label>
                <textarea
                  id="msg-reply"
                  rows={3}
                  maxLength={2000}
                  placeholder="Type a message…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                ></textarea>
              </div>

              {photo ? (
                <div className="msg-compose__photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.preview} alt="" />
                  <div className="field">
                    <label htmlFor="msg-photo-alt">Describe the photo (optional)</label>
                    <input
                      id="msg-photo-alt"
                      type="text"
                      maxLength={300}
                      value={alt}
                      onChange={(e) => setAlt(e.target.value)}
                      aria-describedby="msg-photo-alt-hint"
                      placeholder="For example: the strap is torn near the buckle"
                    />
                    <p id="msg-photo-alt-hint" className="hint">
                      Read aloud to people who cannot see the photo.
                    </p>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={removePhoto}>
                      <Icon name="x" size={16} /> Remove photo
                    </button>
                  </div>
                </div>
              ) : null}

              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => void choosePhoto(e.target.files?.[0])}
              />
              <div className="form-actions">
                {photo ? null : (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    ref={addPhotoRef}
                    disabled={preparing || busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Icon name="image" size={18} /> {preparing ? "Preparing photo…" : "Add a photo"}
                  </button>
                )}
                <button className="btn btn--primary" disabled={busy || preparing} onClick={send}>
                  {busy ? "Sending…" : photo ? "Send photo" : "Send"}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

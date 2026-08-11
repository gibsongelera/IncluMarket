"use client";

import { useEffect, useRef, useState } from "react";
import { sendChatMessage, escalateChat, fetchChatHistory } from "@/lib/actions/chat";
import { toast } from "@/lib/toast";
import { flashVisualAlert } from "./VisualAlert";
import { Icon } from "./Icon";

type ChatEntry = { role: "user" | "bot" | "system"; body: string };

const SESSION_KEY = "im_chat_session_id";
const GUEST_KEY = "im_chat_guest_id";

function getGuestId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(GUEST_KEY);
  if (!id) {
    id = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(GUEST_KEY, id);
  }
  return id;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatEntry[]>([
    {
      role: "bot",
      body: "Hi! I'm the IncluMarket assistant. Ask me about orders, shipping, returns, accessibility, or selling on IncluMarket.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(SESSION_KEY);
    if (stored) setSessionId(Number(stored));
  }, []);

  useEffect(() => {
    if (!open || !sessionId) return;
    let cancelled = false;
    (async () => {
      const res = await fetchChatHistory(sessionId, getGuestId());
      if (cancelled || !res.ok || !res.messages?.length) return;
      setMessages(res.messages);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sessionId]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        fabRef.current?.focus();
      }
    }
    function onDocClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("keydown", onKeyDown);
      document.addEventListener("mousedown", onDocClick);
      inputRef.current?.focus();
    }
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", body: text }]);
    setBusy(true);
    const res = await sendChatMessage(sessionId, getGuestId(), text);
    setBusy(false);
    if (!res.ok) {
      toast(res.error || "The assistant is unavailable right now.", "error");
      return;
    }
    if (res.sessionId) {
      setSessionId(res.sessionId);
      window.localStorage.setItem(SESSION_KEY, String(res.sessionId));
    }
    setMessages((m) => [...m, { role: "bot", body: res.reply || "" }]);
    flashVisualAlert({ message: "Assistant replied", tone: "info" });
    if (res.escalated) await requestHuman(res.sessionId ?? sessionId);
  }

  async function requestHuman(id: number | null) {
    if (!id || escalated) return;
    const res = await escalateChat(id);
    if (!res.ok) {
      setMessages((m) => [...m, { role: "system", body: res.error || "Could not reach our support team." }]);
      return;
    }
    setEscalated(true);
    setMessages((m) => [
      ...m,
      { role: "system", body: "This conversation has been sent to our support team as a ticket." },
    ]);
  }

  return (
    <div className="chat-widget" ref={panelRef}>
      {open ? (
        <div className="chat-panel" role="dialog" aria-label="IncluMarket assistant" aria-modal="false">
          <div className="chat-panel__head">
            <strong>IncluMarket Assistant</strong>
            <button
              type="button"
              className="icon-btn"
              aria-label="Close chat"
              onClick={() => {
                setOpen(false);
                fabRef.current?.focus();
              }}
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          <div className="chat-log" ref={logRef} aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={`chat-message chat-message--${m.role}`}>
                {m.body}
              </div>
            ))}
            {busy ? <div className="chat-message chat-message--bot muted small">Typing…</div> : null}
          </div>

          <div className="chat-panel__actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={escalated}
              onClick={() => requestHuman(sessionId)}
            >
              {escalated ? "Support notified" : "Talk to a human"}
            </button>
          </div>

          <form className="chat-form" onSubmit={send}>
            <label htmlFor="chat-input" className="sr-only">
              Message the IncluMarket assistant
            </label>
            <input
              id="chat-input"
              ref={inputRef}
              type="text"
              placeholder="Type a message…"
              autoComplete="off"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
            />
            <button type="submit" className="icon-btn" aria-label="Send message" disabled={busy || !input.trim()}>
              <Icon name="send" size={16} />
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        ref={fabRef}
        className="chat-fab"
        aria-label={open ? "Close assistant chat" : "Open assistant chat"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? "x" : "chat"} size={24} />
      </button>
    </div>
  );
}

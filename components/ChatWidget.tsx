"use client";

import { useEffect, useRef, useState } from "react";
import { sendChatMessage, escalateChat, fetchChatHistory } from "@/lib/actions/chat";
import { toast } from "@/lib/toast";
import { flashVisualAlert } from "./VisualAlert";
import { Icon } from "./Icon";

type ChatEntry = { role: "user" | "bot" | "system"; body: string };

// No client-side identity. The session is resolved server-side from the auth
// session or an httpOnly guest cookie, so there is no id in localStorage for a
// page script to read, forge, or leave behind after someone signs out on a
// shared device. Older builds stored both; they are cleaned up on mount.
const LEGACY_KEYS = ["im_chat_session_id", "im_chat_guest_id"];

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
  const panelRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    for (const key of LEGACY_KEYS) window.localStorage.removeItem(key);
  }, []);

  // Load the caller's own transcript when the panel opens. No id is passed:
  // the server resolves whose conversation this is.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const res = await fetchChatHistory();
      if (cancelled || !res.ok || !res.messages.length) return;
      setMessages(res.messages);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

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
    const res = await sendChatMessage(text);
    setBusy(false);
    if (!res.ok) {
      toast(res.error || "The assistant is unavailable right now.", "error");
      return;
    }
    setMessages((m) => [...m, { role: "bot", body: res.reply || "" }]);
    flashVisualAlert({ message: "Assistant replied", tone: "info" });
    if (res.escalated) await requestHuman();
  }

  async function requestHuman() {
    if (escalated) return;
    const res = await escalateChat();
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
              onClick={() => requestHuman()}
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ToastDetail, ToastVariant } from "@/lib/toast";
import { prefersReducedMotion } from "@/lib/a11y/prefs";
import { Icon } from "./Icon";

/**
 * Toasts used to vanish after 3.2 s with no way to keep or dismiss them, and
 * the whole region was the live region, so an error read out once and was
 * gone before a slow reader or a screen-magnifier user found it (M-03,
 * WCAG 2.2.1). Now:
 *   - success and info stay 6 s, warnings 8 s, errors until dismissed
 *   - hovering, focusing or leaving the tab pauses every timer
 *   - each toast has a 44 px close button; Escape closes the focused one
 *   - two always-mounted, visually hidden announcers carry the words: polite
 *     for most, assertive for errors. The visible stack is not a live region,
 *     so the close button is never read out as part of the message.
 */
const DURATION: Record<ToastVariant, number | null> = {
  success: 6000,
  info: 6000,
  warning: 8000,
  error: null,
};
const EXIT_MS = 120;
const MAX_VISIBLE = 4;

interface ActiveToast extends ToastDetail {
  id: number;
  leaving: boolean;
}

interface Timer {
  remaining: number;
  startedAt: number;
  handle: number | null;
}

export function Toaster() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const timers = useRef(new Map<number, Timer>());
  const paused = useRef(false);
  const regionRef = useRef<HTMLDivElement>(null);
  // Where keyboard focus came from before it entered the stack, so closing
  // the last toast does not drop focus to the top of the page.
  const returnFocus = useRef<HTMLElement | null>(null);

  const dismiss = useCallback((id: number) => {
    const region = regionRef.current;
    if (region && region.contains(document.activeElement)) {
      const others = [...region.querySelectorAll<HTMLButtonElement>(".toast:not([data-leaving]) .toast__close")].filter(
        (b) => b.closest("[data-toast-id]")?.getAttribute("data-toast-id") !== String(id)
      );
      const target = others[others.length - 1] ?? (returnFocus.current?.isConnected ? returnFocus.current : null);
      target?.focus();
    }
    const timer = timers.current.get(id);
    if (timer?.handle) window.clearTimeout(timer.handle);
    timers.current.delete(id);
    if (prefersReducedMotion()) {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      return;
    }
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const start = useCallback(
    (id: number) => {
      const timer = timers.current.get(id);
      if (!timer || paused.current) return;
      timer.startedAt = Date.now();
      timer.handle = window.setTimeout(() => dismiss(id), timer.remaining);
    },
    [dismiss]
  );

  const pauseAll = useCallback(() => {
    if (paused.current) return;
    paused.current = true;
    const now = Date.now();
    for (const timer of timers.current.values()) {
      if (timer.handle) window.clearTimeout(timer.handle);
      timer.handle = null;
      timer.remaining = Math.max(1000, timer.remaining - (now - timer.startedAt));
    }
  }, []);

  const resumeAll = useCallback(() => {
    if (!paused.current) return;
    paused.current = false;
    for (const id of timers.current.keys()) start(id);
  }, [start]);

  useEffect(() => {
    let counter = 0;
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      const id = ++counter;
      setToasts((prev) => {
        const next = [...prev, { ...detail, id, leaving: false }];
        // Oldest goes first when the stack is full, errors included: four
        // is already more than anyone reads.
        for (const old of next.slice(0, Math.max(0, next.length - MAX_VISIBLE))) {
          const timer = timers.current.get(old.id);
          if (timer?.handle) window.clearTimeout(timer.handle);
          timers.current.delete(old.id);
        }
        return next.slice(-MAX_VISIBLE);
      });

      // Clear, then set on the next frame, so the same message twice in a
      // row is announced twice.
      const announce = detail.variant === "error" ? setAssertive : setPolite;
      announce("");
      window.requestAnimationFrame(() => announce(detail.message));

      const ms = DURATION[detail.variant];
      if (ms !== null) {
        timers.current.set(id, { remaining: ms, startedAt: Date.now(), handle: null });
        start(id);
      }
    }
    function onVisibility() {
      if (document.hidden) pauseAll();
      else if (!regionRef.current?.matches(":hover, :focus-within")) resumeAll();
    }
    const all = timers.current;
    window.addEventListener("im:toast", onToast);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("im:toast", onToast);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const timer of all.values()) if (timer.handle) window.clearTimeout(timer.handle);
      all.clear();
    };
  }, [start, pauseAll, resumeAll]);

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
      <div
        id="toast-region"
        ref={regionRef}
        className="toast-region"
        onPointerEnter={pauseAll}
        onPointerLeave={() => {
          if (!regionRef.current?.contains(document.activeElement)) resumeAll();
        }}
        onFocus={(e) => {
          const from = e.relatedTarget as HTMLElement | null;
          if (from && !e.currentTarget.contains(from)) returnFocus.current = from;
          pauseAll();
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) resumeAll();
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast--${t.variant}`}
            data-toast-id={t.id}
            data-leaving={t.leaving ? "" : undefined}
            onKeyDown={(e) => {
              if (e.key === "Escape") dismiss(t.id);
            }}
          >
            <p className="toast__message">{t.message}</p>
            <button
              type="button"
              className="toast__close"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
            >
              <Icon name="x" size={18} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

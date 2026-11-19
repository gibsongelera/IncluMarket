"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePresence } from "@/lib/a11y/use-presence";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import {
  getMyNotifications,
  getMyUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/actions/notifications";
import type { Notification } from "@/lib/types";
import { Icon } from "./Icon";

/**
 * The bell and its panel. Rendered twice for a signed-in user: in the header
 * (768px and up) and as a tab in the phone tab bar (MobileNav, `variant="tab"`,
 * between the last tab and More). CSS shows one of the two; the hidden one
 * makes no requests (see the poll below).
 */
export function NotificationBell({
  initialUnread,
  initialNotifications,
  variant = "header",
}: {
  initialUnread: number;
  initialNotifications: Notification[];
  variant?: "header" | "tab";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const presence = usePresence(open);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState(initialNotifications);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Poll the unread count every 30 s while the tab is visible; stop while it
  // is hidden (no requests from a background tab) and catch up on return.
  // Only the copy on screen asks: the other is display:none (no client
  // rects). Crossing the 768px breakpoint shows it, so it catches up then.
  // The button, not the wrapper: the tab's wrapper is display:contents,
  // which has no rects of its own.
  useEffect(() => {
    let interval: number | null = null;
    const shown = () => (triggerRef.current?.getClientRects().length ?? 0) > 0;
    const tick = async () => {
      if (!shown()) return;
      try {
        setUnread(await getMyUnreadCount());
      } catch {}
    };
    const mq = window.matchMedia("(max-width: 767px)");
    const onBreakpoint = () => void tick();
    mq.addEventListener("change", onBreakpoint);
    const start = () => {
      if (interval === null) interval = window.setInterval(tick, 30000);
    };
    const stop = () => {
      if (interval !== null) window.clearInterval(interval);
      interval = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        void tick();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      mq.removeEventListener("change", onBreakpoint);
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    if (open) {
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onKeyDown);
      panelRef.current?.focus();
    }
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      const [fresh, count] = await Promise.all([getMyNotifications(), getMyUnreadCount()]);
      setItems(fresh);
      setUnread(count);
    }
  }

  async function onItemClick(n: Notification) {
    if (!n.is_read) {
      await markNotificationRead(n.id);
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  async function onMarkAll() {
    await markAllNotificationsRead();
    setItems((list) => list.map((x) => ({ ...x, is_read: true })));
    setUnread(0);
  }

  const isTab = variant === "tab";
  // The panel is named after the control that opened it.
  const title = isTab ? "Alerts" : "Notifications";

  return (
    <div
      className={isTab ? "notification-bell notification-bell--tab" : "notification-bell"}
      ref={wrapRef}
      // Tabbing out of the open panel closes it, rather than leaving it
      // over the page that focus moves into (WCAG 2.4.11). Only for focus
      // that lands somewhere: none (relatedTarget null) is also what
      // "Mark all read" disabling itself can cause, and a click outside is
      // already handled by the mousedown listener.
      onBlur={(e) => {
        const to = e.relatedTarget as Node | null;
        if (open && to && !wrapRef.current?.contains(to)) setOpen(false);
      }}
    >
      {isTab ? (
        // A tab like its neighbours: icon, visible word, badge read out after
        // the word. The word is the accessible name's start (WCAG 2.5.3), so
        // no aria-label; "Alerts" because "Notifications" would not fit six
        // to a row on a phone.
        <button
          type="button"
          ref={triggerRef}
          className="mobile-nav__item"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggleOpen}
        >
          <span className="mobile-nav__icon">
            <Icon name="bell" size={22} />
            {unread > 0 ? (
              <span className="mobile-nav__badge" aria-hidden="true">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </span>
          <span className="mobile-nav__label">Alerts</span>
          {unread > 0 ? <span className="sr-only">, {unread} unread</span> : null}
        </button>
      ) : (
        <button
          type="button"
          ref={triggerRef}
          className="icon-btn icon-btn--badged"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          onClick={toggleOpen}
        >
          <Icon name="bell" size={18} />
          {unread > 0 ? <span className="icon-btn__count">{unread > 99 ? "99+" : unread}</span> : null}
        </button>
      )}
      {presence.mounted ? (
        <div
          className="notification-panel"
          data-state={presence.closing ? "closing" : "open"}
          inert={presence.closing}
          id={panelId}
          role="dialog"
          aria-label={title}
          ref={panelRef}
          tabIndex={-1}
        >
          <div className="notification-panel__head">
            <strong>{title}</strong>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={onMarkAll}
              disabled={unread === 0}
            >
              Mark all read
            </button>
          </div>
          {items.length === 0 ? (
            <p className="empty">No notifications yet.</p>
          ) : (
            <ul className="notification-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`notification-item${n.is_read ? "" : " is-unread"}`}
                    onClick={() => onItemClick(n)}
                  >
                    <span className="notification-item__title">
                      {n.is_read ? null : <span className="sr-only">Unread: </span>}
                      {n.title}
                    </span>
                    {n.body ? <span className="notification-item__body">{n.body}</span> : null}
                    <span className="muted small">{formatDateTime(n.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="notification-panel__foot">
            <Link href="/notifications" onClick={() => setOpen(false)}>
              See all notifications
            </Link>
            <Link href="/account/notifications" onClick={() => setOpen(false)}>
              Settings
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

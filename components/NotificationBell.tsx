"use client";

import { useEffect, useRef, useState } from "react";
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

export function NotificationBell({
  initialUnread,
  initialNotifications,
}: {
  initialUnread: number;
  initialNotifications: Notification[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const presence = usePresence(open);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState(initialNotifications);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Poll the unread count every 30 s while the tab is visible; stop while it
  // is hidden (no requests from a background tab) and catch up on return.
  useEffect(() => {
    let interval: number | null = null;
    const tick = async () => {
      try {
        setUnread(await getMyUnreadCount());
      } catch {}
    };
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

  return (
    <div className="notification-bell" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="icon-btn icon-btn--badged"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notification-panel"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={toggleOpen}
      >
        <Icon name="bell" size={18} />
        {unread > 0 ? <span className="icon-btn__count">{unread > 9 ? "9+" : unread}</span> : null}
      </button>
      {presence.mounted ? (
        <div
          className="notification-panel"
          data-state={presence.closing ? "closing" : "open"}
          inert={presence.closing}
          id="notification-panel"
          role="dialog"
          aria-label="Notifications"
          ref={panelRef}
          tabIndex={-1}
        >
          <div className="notification-panel__head">
            <strong>Notifications</strong>
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

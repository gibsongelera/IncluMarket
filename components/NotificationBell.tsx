"use client";

import { useEffect, useRef, useState } from "react";
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
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState(initialNotifications);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      setUnread(await getMyUnreadCount());
    }, 30000);
    return () => clearInterval(interval);
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
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={toggleOpen}
      >
        <Icon name="bell" size={18} />
        {unread > 0 ? <span className="icon-btn__count">{unread > 9 ? "9+" : unread}</span> : null}
      </button>
      {open ? (
        <div className="notification-panel" role="menu" aria-label="Notifications" ref={panelRef} tabIndex={-1}>
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
                    <span className="notification-item__title">{n.title}</span>
                    {n.body ? <span className="notification-item__body">{n.body}</span> : null}
                    <span className="muted small">{formatDateTime(n.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

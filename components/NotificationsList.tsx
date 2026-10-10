"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { Notification } from "@/lib/types";

/** The full notification list (C-24). Unread is stated in words, not colour. */
export function NotificationsList({ items, hasUnread }: { items: Notification[]; hasUnread: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markOne(id: number) {
    const res = await markNotificationRead(id);
    if (!res.ok) return toast(res.error || "Could not update.", "error");
    router.refresh();
  }

  async function markAll() {
    setBusy(true);
    const res = await markAllNotificationsRead();
    setBusy(false);
    if (!res.ok) return toast(res.error || "Could not update.", "error");
    toast("All notifications marked as read.", "success");
    router.refresh();
  }

  return (
    <>
      {hasUnread ? (
        <p>
          <button type="button" className="btn btn--outline btn--sm" onClick={markAll} disabled={busy}>
            Mark all as read
          </button>
        </p>
      ) : null}
      {items.length ? (
        <ul className="notif-list" role="list">
          {items.map((n) => (
            <li key={n.id} className={`notif-item${n.is_read ? "" : " notif-item--unread"}`}>
              <div className="notif-item__body">
                <p className="notif-item__title">
                  {n.is_read ? null : <span className="badge badge--yellow">Unread</span>} {n.title}
                </p>
                {n.body ? <p className="notif-item__text">{n.body}</p> : null}
                <p className="muted small">{formatDateTime(n.created_at)}</p>
              </div>
              <div className="notif-item__actions">
                {n.link && n.link.startsWith("/") ? (
                  <Link
                    className="btn btn--ghost btn--sm"
                    href={n.link}
                    onClick={() => {
                      if (!n.is_read) void markNotificationRead(n.id);
                    }}
                  >
                    Open<span className="sr-only">: {n.title}</span>
                  </Link>
                ) : null}
                {n.is_read ? null : (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => markOne(n.id)}>
                    Mark as read<span className="sr-only">: {n.title}</span>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Nothing here.</p>
      )}
    </>
  );
}

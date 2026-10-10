import Link from "next/link";
import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { NotificationsList } from "@/components/NotificationsList";
import { NOTIFICATIONS_PAGE_SIZE, getNotificationsPage } from "@/lib/data";
import { groupsFor } from "@/lib/notification-types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

/**
 * Every notification (C-24) — the bell shows only the latest few. Filter by
 * unread or by kind, page through older ones, mark read. Settings for what
 * arrives, in the app and by email, live in Account → Notifications.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; group?: string; page?: string }>;
}) {
  const session = await requireRole([]);
  const sp = await searchParams;
  const groups = groupsFor(session.role);
  const group = groups.find((g) => g.key === sp.group) ?? null;
  const unreadOnly = sp.view === "unread";
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  const [{ items, total }, unread] = await Promise.all([
    getNotificationsPage(session.user_id, { page, unreadOnly, types: group?.types }),
    getNotificationsPage(session.user_id, { page: 1, unreadOnly: true }),
  ]);
  const pages = Math.max(1, Math.ceil(total / NOTIFICATIONS_PAGE_SIZE));
  const href = (o: { view?: string; group?: string; page?: number }) => {
    const p = new URLSearchParams();
    if (o.view) p.set("view", o.view);
    if (o.group) p.set("group", o.group);
    if (o.page && o.page > 1) p.set("page", String(o.page));
    const qs = p.toString();
    return qs ? `/notifications?${qs}` : "/notifications";
  };
  const filters = [
    { label: "All", href: href({}), current: !unreadOnly && !group },
    { label: `Unread (${unread.total})`, href: href({ view: "unread" }), current: unreadOnly },
    ...groups.map((g) => ({ label: g.label, href: href({ group: g.key }), current: group?.key === g.key })),
  ];

  return (
    <>
      <SiteHeader variant={session.role} session={session} />
      <main id="main" tabIndex={-1} className="container main--notifications">
        <div className="page-head">
          <h1>Notifications</h1>
          <Link href="/account/notifications">Notification settings</Link>
        </div>
        <nav className="tabs" aria-label="Show notifications">
          {filters.map((f) => (
            <Link key={f.href} href={f.href} className={`tab${f.current ? " tab--active" : ""}`} aria-current={f.current ? "page" : undefined}>
              {f.label}
            </Link>
          ))}
        </nav>
        <p className="muted" role="status">
          {total} notification{total === 1 ? "" : "s"}
          {pages > 1 ? ` · page ${page} of ${pages}` : ""}
        </p>
        <NotificationsList items={items} hasUnread={unread.total > 0} />
        {pages > 1 ? (
          <nav className="pager" aria-label="Pages">
            {page > 1 ? (
              <Link className="btn btn--outline btn--sm" href={href({ view: unreadOnly ? "unread" : undefined, group: group?.key, page: page - 1 })}>
                Newer
              </Link>
            ) : null}
            {page < pages ? (
              <Link className="btn btn--outline btn--sm" href={href({ view: unreadOnly ? "unread" : undefined, group: group?.key, page: page + 1 })}>
                Older
              </Link>
            ) : null}
          </nav>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}

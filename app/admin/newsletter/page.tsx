import { requireRole } from "@/lib/session";
import { getNewsletterSubscribers } from "@/lib/admin-content";
import { AdminNewsletterClient } from "@/components/AdminNewsletterClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletter" };

/** Admin → Newsletter (C-40): who is subscribed, and an export for sending. */
export default async function AdminNewsletterPage() {
  await requireRole(["admin"]);
  const subscribers = await getNewsletterSubscribers();
  const active = subscribers.filter((s) => !s.unsubscribedAt);
  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <h1>Newsletter</h1>
      <p className="muted">
        People who asked for news by email. The export holds only current subscribers; every export is recorded in the
        audit log. Send through a tool that adds each person&rsquo;s unsubscribe link, and delete exported files when
        you are done.
      </p>
      <section className="kpis" aria-label="Newsletter totals">
        <article className="kpi">
          <span className="kpi__label">Subscribed</span>
          <strong className="kpi__value">{active.length}</strong>
        </article>
        <article className="kpi">
          <span className="kpi__label">Unsubscribed</span>
          <strong className="kpi__value">{subscribers.length - active.length}</strong>
        </article>
      </section>
      <AdminNewsletterClient subscribers={subscribers} />
    </main>
  );
}

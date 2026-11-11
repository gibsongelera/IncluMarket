import { requireRole } from "@/lib/session";
import { Chart } from "@/components/Chart";
import { formatDateTime } from "@/lib/format";
import { getAuditLogs, getConsentLogs, getOrders, getProfiles } from "@/lib/data";
import { getContactMessages, getPrivacyRequestsForAdmin } from "@/lib/admin-content";
import { ContactInboxClient, PrivacyRequestsClient } from "@/components/AdminInboxClient";
import { TableWrap } from "@/components/TableWrap";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy and compliance" };

/** Every order status, in the order the dashboards list them (03 §4); an unknown one follows. */
const ORDER_STATUS = ["pending", "processing", "shipped", "delivered", "cancelled", "return_requested", "returned"];

/**
 * A status in the words its pill shows (components/Pill.tsx: underscores as
 * spaces), first letter capitalised as the pill's CSS does: "Return requested".
 */
function statusWords(status: string): string {
  const words = status.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Admin → Compliance: data-subject requests, the contact inbox, consent and
 * the audit trail. Every figure here is counted from the database; the
 * "simulated" security tiles it used to show were removed (N-26).
 */
export default async function AdminCompliancePage() {
  await requireRole(["admin"]);
  const [profiles, consents, audits, orders, privacy, contact] = await Promise.all([
    getProfiles(),
    getConsentLogs(),
    getAuditLogs(),
    getOrders(),
    getPrivacyRequestsForAdmin(),
    getContactMessages(),
  ]);

  const consentedIds = new Set(consents.map((c) => c.user_id));
  const nameById: Record<number, string> = {};
  profiles.forEach((p) => (nameById[p.id] = p.name));
  const openPrivacy = privacy?.filter((r) => r.status === "open" || r.status === "in_progress").length ?? 0;
  const newContact = contact?.filter((m) => m.status === "new").length ?? 0;

  // Daily activity: last 14 days
  const days = 14;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets: { label: string; start: number; end: number; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime());
    d.setDate(d.getDate() - i);
    buckets.push({
      label: d.getMonth() + 1 + "/" + d.getDate(),
      start: d.getTime(),
      end: d.getTime() + 24 * 3600 * 1000,
      value: 0,
    });
  }
  audits.forEach((a) => {
    const t = new Date(a.created_at).getTime();
    for (const b of buckets) {
      if (t >= b.start && t < b.end) {
        b.value++;
        break;
      }
    }
  });
  const recentEvents = buckets.reduce((n, b) => n + b.value, 0);

  // Every order by its current status, zeros kept, for the donut and its table.
  const byStatus = new Map<string, number>(ORDER_STATUS.map((s) => [s, 0]));
  orders.forEach((o) => byStatus.set(o.order_status, (byStatus.get(o.order_status) ?? 0) + 1));
  const statusData = [...byStatus].map(([status, value]) => ({ label: statusWords(status), value, status }));

  const rows = audits.slice(0, 40);

  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <h1>Privacy and compliance</h1>
      <p className="muted">Data Privacy Act (RA 10173): requests, consent and the audit trail.</p>

      <section className="kpis" aria-label="Compliance figures">
        <article className="kpi">
          <span className="kpi__label">Privacy requests open</span>
          <strong className="kpi__value">{openPrivacy}</strong>
        </article>
        <article className="kpi">
          <span className="kpi__label">New contact messages</span>
          <strong className="kpi__value">{newContact}</strong>
        </article>
        <article className="kpi">
          <span className="kpi__label">Accounts with logged consent</span>
          <strong className="kpi__value">
            {consentedIds.size} of {profiles.length}
          </strong>
        </article>
        <article className="kpi">
          <span className="kpi__label">Audit events, last 14 days</span>
          <strong className="kpi__value">{recentEvents}</strong>
        </article>
      </section>

      <section id="privacy" aria-labelledby="privacy-title" tabIndex={-1}>
        <h2 id="privacy-title">Privacy requests</h2>
        <p className="muted small">Answer each within 15 days. The requester is told in the app and by email.</p>
        {privacy === null ? (
          <p className="notice notice--info">Privacy requests need database migration 0019.</p>
        ) : (
          <PrivacyRequestsClient requests={privacy} />
        )}
      </section>

      <section id="contact" aria-labelledby="contact-title" tabIndex={-1}>
        <h2 id="contact-title">Contact messages</h2>
        <p className="muted small">From the Contact page. Messages are kept for one year.</p>
        {contact === null ? (
          <p className="notice notice--info">The contact inbox needs database migration 0019.</p>
        ) : (
          <ContactInboxClient messages={contact} />
        )}
      </section>

      <section className="chart-grid">
        <article className="chart-card">
          <div className="chart-card__head">
            <div>
              <h2>Daily activity (last 14 days)</h2>
              <p className="chart-card__subtitle">Audit events per day</p>
            </div>
          </div>
          <Chart
            kind="line"
            ariaLabel="Daily activity chart"
            labelHeading="Day"
            valueLabel="Events"
            data={[{ points: buckets.map((b) => ({ label: b.label, value: b.value })) }]}
          />
        </article>
        <article className="chart-card">
          <div className="chart-card__head">
            <div>
              <h2>Orders by status</h2>
              <p className="chart-card__subtitle">Every order, by where it is now</p>
            </div>
          </div>
          <Chart
            kind="donut"
            ariaLabel="Orders by status chart"
            labelHeading="Status"
            valueLabel="Orders"
            unit={["order", "orders"]}
            empty="No orders yet."
            data={statusData}
          />
        </article>
      </section>

      <section>
        <h2>Audit trail (recent events)</h2>
        <TableWrap label="Audit log">
          <table className="data-table data-table--cards" aria-label="Audit trail">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody id="audit-rows">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty">
                    No audit entries yet.
                  </td>
                </tr>
              ) : (
                rows.map((a) => (
                  <tr key={a.id}>
                    <td>{formatDateTime(a.created_at)}</td>
                    <td>
                      {a.actor_id != null ? nameById[a.actor_id] || `user:${a.actor_id}` : "system"}{" "}
                      <span className="muted small">({a.actor_role})</span>
                    </td>
                    <td>{a.action}</td>
                    <td>
                      <code>{a.target}</code>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableWrap>
      </section>

      <section className="note">
        <h2>How data is protected</h2>
        <p>
          Sign-in uses Supabase Auth: passwords are hashed by Supabase and never stored or seen by this application.
          Pages and data travel over HTTPS. The application reads and writes the database on the server, after its own
          role checks; row-level security guards any direct access with the public key. PWD ID photos sit in a private
          bucket, open only through short-lived links for reviewers, and are deleted after the retention period set in
          Settings.
        </p>
      </section>
    </main>
  );
}

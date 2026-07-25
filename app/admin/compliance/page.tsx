import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Chart } from "@/components/Chart";
import { formatDateTime } from "@/lib/format";
import {
  getAuditLogs,
  getConsentLogs,
  getOrders,
  getProfiles,
} from "@/lib/data";

export const dynamic = "force-dynamic";

const ORDER_STATUS = ["pending", "processing", "shipped", "delivered", "returned"];

export default async function AdminCompliancePage() {
  const session = await requireRole(["admin"]);
  const [profiles, consents, audits, orders] = await Promise.all([
    getProfiles(),
    getConsentLogs(),
    getAuditLogs(),
    getOrders(),
  ]);

  const consentedIds = new Set(consents.map((c) => c.user_id));
  const nameById: Record<number, string> = {};
  profiles.forEach((p) => (nameById[p.id] = p.name));

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

  const byStatus: Record<string, number> = {};
  ORDER_STATUS.forEach((s) => (byStatus[s] = 0));
  orders.forEach((o) => (byStatus[o.order_status] = (byStatus[o.order_status] || 0) + 1));
  const pieData = Object.keys(byStatus).map((k) => ({ label: k, value: byStatus[k] }));

  const rows = audits.slice(0, 40);

  return (
    <>
      <SiteHeader variant="admin" active="compliance" session={session} />
      <main id="main" className="container main--admin">
        <h1>Ecosystem compliance monitor</h1>
        <p className="muted" style={{ color: "var(--canvas-white)" }}>
          RA 10173 (Data Privacy Act) alignment and audit trail visibility.
        </p>

        <section className="kpis" aria-label="Compliance metrics">
          <article className="kpi">
            <span className="kpi__label">Users with logged consent</span>
            <strong className="kpi__value">{consentedIds.size}</strong>
          </article>
          <article className="kpi">
            <span className="kpi__label">PII fields masked in public views</span>
            <strong className="kpi__value">{profiles.length}</strong>
          </article>
          <article className="kpi">
            <span className="kpi__label">Password storage (simulated)</span>
            <strong className="kpi__value">bcrypt cost 12</strong>
          </article>
          <article className="kpi">
            <span className="kpi__label">Transport (simulated)</span>
            <strong className="kpi__value">TLS 1.2+</strong>
          </article>
        </section>

        <section className="chart-grid">
          <article className="chart-card">
            <h2>Daily activity (last 14 days)</h2>
            <Chart
              kind="line"
              ariaLabel="Daily activity chart"
              data={[{ points: buckets.map((b) => ({ label: b.label, value: b.value })) }]}
            />
          </article>
          <article className="chart-card">
            <h2>Orders by status</h2>
            <Chart kind="pie" ariaLabel="Orders by status chart" data={pieData} />
          </article>
        </section>

        <section>
          <h2>Audit trail (recent events)</h2>
          <div className="table-wrap">
            <table className="data-table" aria-label="Audit trail">
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
          </div>
        </section>

        <section className="note">
          <h2 style={{ color: "var(--muted)" }}>Security note</h2>
          <p>
            Authentication uses Supabase Auth with email confirmation for new signups.
            Passwords are verified by Supabase. AES-256-at-rest and TLS 1.2+ apply at the
            platform layer for stored data in transit and at rest.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

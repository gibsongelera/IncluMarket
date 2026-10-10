import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getAdminOverview, type OverviewCount } from "@/lib/admin-overview";
import { sweepPwdVerifications } from "@/lib/pwd/sweep";
import { expireStalePayments } from "@/lib/payments/stock";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

function Tile({ t, urgent }: { t: OverviewCount; urgent?: boolean }) {
  const unavailable = t.count === null;
  return (
    <li>
      <Link className={`overview-tile${urgent && t.count ? " overview-tile--attention" : ""}`} href={t.href}>
        <strong className="overview-tile__count">{unavailable ? "—" : t.count}</strong>
        <span className="overview-tile__label">{t.label}</span>
        {unavailable ? <span className="small muted">Needs a database update</span> : null}
      </Link>
    </li>
  );
}

/** Admin → Overview, the admin's home (C-37, N-34). */
export default async function AdminOverviewPage() {
  await requireRole(["admin"]);
  // Time-based upkeep runs from here too (no scheduler on this deployment).
  await Promise.all([sweepPwdVerifications(), expireStalePayments()]);
  const { todo, health } = await getAdminOverview();
  const waiting = todo.filter((t) => (t.count ?? 0) > 0);

  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <h1>Overview</h1>
      <section aria-labelledby="ov-todo">
        <h2 id="ov-todo">Needs attention</h2>
        <p className="muted">{waiting.length ? `${waiting.length} kind${waiting.length === 1 ? "" : "s"} of task waiting.` : "Nothing waiting right now."}</p>
        <ul className="overview-grid" role="list">
          {todo.map((t) => (
            <Tile key={t.key} t={t} urgent />
          ))}
        </ul>
      </section>
      <section aria-labelledby="ov-health">
        <h2 id="ov-health">The shop</h2>
        <ul className="overview-grid" role="list">
          {health.map((t) => (
            <Tile key={t.key} t={t} />
          ))}
        </ul>
      </section>
    </main>
  );
}

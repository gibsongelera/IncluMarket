import { requireRole } from "@/lib/session";
import { getSoldOutAudit, EXPORT_LIMIT, PAGE_LIMIT } from "@/lib/stock-audit";
import { HistoryTable, SoldOutTable } from "@/components/AdminSoldOutTables";
import { ReportDownloadButton } from "@/components/AdminReportsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sold-out audit" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Admin → Sold-out audit (migration 0027). When each listing sold out and
 * how many units it has sold, for the workshop's stock records; and every
 * photo taken off a listing, or listing deleted, kept with the old photo.
 */
export default async function AdminSoldOutPage() {
  await requireRole(["admin"]);
  const audit = await getSoldOutAudit();
  const needsMigration = audit.soldOut === null || audit.history === null;

  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <h1>Sold-out audit</h1>
      <p className="muted">
        When each item sold out and how many units it has sold, and every photo or listing that was removed, kept
        with the old photo. Sold-out items stay in the shop, marked Sold out, until the seller adds stock.
      </p>

      <section className="kpis" aria-label="Sold-out figures">
        <article className="kpi">
          <span className="kpi__label">Sold out now</span>
          <strong className="kpi__value">{audit.soldOutNow}</strong>
        </article>
        {audit.recent ? (
          <>
            <article className="kpi">
              <span className="kpi__label">Sold out, last 30 days</span>
              <strong className="kpi__value">{audit.recent.soldOut}</strong>
            </article>
            <article className="kpi">
              <span className="kpi__label">Back in stock, last 30 days</span>
              <strong className="kpi__value">{audit.recent.restocked}</strong>
            </article>
            <article className="kpi">
              <span className="kpi__label">Photos and listings removed, last 30 days</span>
              <strong className="kpi__value">{audit.recent.removed}</strong>
            </article>
          </>
        ) : null}
      </section>

      {needsMigration ? (
        <p className="notice notice--info">
          Sold-out dates and the item history need database migration 0027. Until it is applied,{" "}
          {plural(audit.soldOutNow, "listing is", "listings are")} sold out now, without dates, and removed photos
          are not kept.
        </p>
      ) : null}

      <section aria-labelledby="sold-out-title">
        <div className="section-head">
          <h2 id="sold-out-title">Sold out</h2>
          {audit.soldOut ? <ReportDownloadButton type="sold_out" label="Export sold-out report (.xlsx)" /> : null}
        </div>
        {audit.soldOut === null ? null : audit.soldOut.length === 0 ? (
          <div className="empty">
            <p>
              <strong>No item has sold out yet.</strong> When the last unit of a listing sells, it shows here with
              the date and the units sold.
            </p>
          </div>
        ) : (
          <>
            <p className="muted small">
              Newest first.{" "}
              {audit.soldOut.length >= PAGE_LIMIT
                ? `Showing the latest ${PAGE_LIMIT}; the Excel file has up to ${EXPORT_LIMIT.toLocaleString("en-PH")}.`
                : "The Excel file has the same rows, with photo links."}
            </p>
            <SoldOutTable rows={audit.soldOut} />
          </>
        )}
      </section>

      <section id="history" aria-labelledby="history-title" tabIndex={-1}>
        <div className="section-head">
          <h2 id="history-title">Removed photos and listings</h2>
          {audit.history ? <ReportDownloadButton type="item_history" label="Export item history (.xlsx)" /> : null}
        </div>
        {audit.history === null ? null : audit.history.length === 0 ? (
          <div className="empty">
            <p>
              <strong>Nothing has been removed.</strong> When a seller or an admin takes a photo off a listing, or a
              listing is deleted, it is kept here with the old photo.
            </p>
          </div>
        ) : (
          <>
            <p className="muted small">
              Newest first. Photos open full size in a new tab.{" "}
              {audit.history.length >= PAGE_LIMIT ? `Showing the latest ${PAGE_LIMIT}.` : null}
            </p>
            <HistoryTable rows={audit.history} />
          </>
        )}
      </section>
    </main>
  );
}

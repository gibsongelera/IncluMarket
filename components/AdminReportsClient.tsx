"use client";

import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { scrollBehavior } from "@/lib/a11y/prefs";
import { exportReport } from "@/lib/actions/admin";
import type { ReportType } from "@/lib/types";
import { Icon } from "./Icon";
import { TableWrap } from "./TableWrap";

const REPORTS: { type: ReportType; label: string; hint: string; filenameExample: string }[] = [
  {
    type: "all",
    label: "Full platform report",
    hint: "One workbook with every sheet below — names, IDs, ISO dates, ISO 4217 PHP amounts.",
    filenameExample: "InclusiveMarket_Full_Platform_Report_YYYY-MM-DD.xlsx",
  },
  {
    type: "users",
    label: "Users",
    hint: "Full name, role, account status, featured sellers (emails masked).",
    filenameExample: "InclusiveMarket_Users_Report_YYYY-MM-DD.xlsx",
  },
  {
    type: "products",
    label: "Products",
    hint: "Product title, seller name, category name, price (PHP).",
    filenameExample: "InclusiveMarket_Products_Report_YYYY-MM-DD.xlsx",
  },
  {
    type: "orders",
    label: "Orders",
    hint: "Buyer name, totals (PHP), payment provider, shipping fields.",
    filenameExample: "InclusiveMarket_Orders_Report_YYYY-MM-DD.xlsx",
  },
  {
    type: "reviews",
    label: "Reviews",
    hint: "Product title, buyer name, rating score, comments.",
    filenameExample: "InclusiveMarket_Reviews_Report_YYYY-MM-DD.xlsx",
  },
  {
    type: "tickets",
    label: "Support tickets",
    hint: "Requester and assignee names, subject, status, priority.",
    filenameExample: "InclusiveMarket_Support_Tickets_Report_YYYY-MM-DD.xlsx",
  },
  {
    type: "audit_logs",
    label: "Audit logs",
    hint: "Actor name/role and actions (latest 5,000 rows).",
    filenameExample: "InclusiveMarket_Audit_Logs_Report_YYYY-MM-DD.xlsx",
  },
  {
    type: "sold_out",
    label: "Sold out",
    hint: "When each item sold out, units sold, back in stock, photo link.",
    filenameExample: "InclusiveMarket_Sold_Out_Report_YYYY-MM-DD.xlsx",
  },
  {
    type: "item_history",
    label: "Item history",
    hint: "Photos and listings removed, with the old photo links and who removed them.",
    filenameExample: "InclusiveMarket_Item_History_Report_YYYY-MM-DD.xlsx",
  },
];

function downloadBase64(base64: string, filename: string) {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function download(type: ReportType): Promise<void> {
  const res = await exportReport(type);
  if (!res.ok || !res.fileBase64 || !res.filename) {
    toast(res.error || "Could not generate the report.", "error");
    return;
  }
  downloadBase64(res.fileBase64, res.filename);
  toast(`Downloaded ${res.filename}`, "success");
}

/** One report's download, for a page that offers its own (Sold-out audit). */
export function ReportDownloadButton({ type, label }: { type: ReportType; label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--outline btn--sm"
      aria-busy={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        await download(type);
        setBusy(false);
      }}
    >
      <Icon name="download" size={16} /> {busy ? "Generating…" : label}
    </button>
  );
}

export function AdminReportsClient() {
  const [busy, setBusy] = useState<ReportType | null>(null);
  // The row a link points at ("#report-orders", from Orders → Export). A
  // page load or an in-page link makes it the :target. A link from another
  // console page arrives by client-side navigation, which sets the URL with
  // history.pushState and leaves :target unchanged, so the row is also
  // marked from the hash itself.
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setTarget(window.location.hash.slice(1) || null);
    read();
    window.addEventListener("hashchange", read);
    window.addEventListener("popstate", read);
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("popstate", read);
    };
  }, []);

  // A link to one report (Orders → "Orders report") lands on its Download
  // button, not only its highlight: a highlight without focus looks focused
  // to a sighted user while Tab still starts at the top of the page.
  useEffect(() => {
    if (!target) return;
    const row = document.getElementById(target);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: scrollBehavior() });
    row.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, [target]);

  async function onExport(type: ReportType) {
    setBusy(type);
    await download(type);
    setBusy(null);
  }

  return (
    <TableWrap label="Report data">
      <table className="data-table data-table--cards" aria-label="Downloadable reports">
        <thead>
          <tr>
            <th scope="col">Report</th>
            <th scope="col">Contents</th>
            <th scope="col">File name pattern</th>
            <th scope="col">Download</th>
          </tr>
        </thead>
        <tbody>
          {REPORTS.map((r) => (
            <tr
              key={r.type}
              id={`report-${r.type}`}
              className={target === `report-${r.type}` ? "is-target" : undefined}
            >
              <td>
                <strong>{r.label}</strong>
              </td>
              <td className="muted small">{r.hint}</td>
              <td>
                <code className="small">{r.filenameExample}</code>
              </td>
              <td>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={busy !== null}
                  onClick={() => onExport(r.type)}
                >
                  <Icon name="download" size={16} /> {busy === r.type ? "Generating…" : "Export .xlsx"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

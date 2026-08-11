"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { exportReport, type ReportType } from "@/lib/actions/admin";
import { Icon } from "./Icon";

const REPORTS: { type: ReportType; label: string; hint: string; filenameExample: string }[] = [
  {
    type: "all",
    label: "Full platform report",
    hint: "One workbook with every sheet below — names, IDs, ISO dates, ISO 4217 PHP amounts.",
    filenameExample: "IncluMarket_Full_Platform_Report_YYYY-MM-DD.xlsx",
  },
  {
    type: "users",
    label: "Users",
    hint: "Full name, role, account status, featured sellers (emails masked).",
    filenameExample: "IncluMarket_Users_Report_YYYY-MM-DD.xlsx",
  },
  {
    type: "products",
    label: "Products",
    hint: "Product title, seller name, category name, price (PHP).",
    filenameExample: "IncluMarket_Products_Report_YYYY-MM-DD.xlsx",
  },
  {
    type: "orders",
    label: "Orders",
    hint: "Buyer name, totals (PHP), payment provider, shipping fields.",
    filenameExample: "IncluMarket_Orders_Report_YYYY-MM-DD.xlsx",
  },
  {
    type: "reviews",
    label: "Reviews",
    hint: "Product title, buyer name, rating score, comments.",
    filenameExample: "IncluMarket_Reviews_Report_YYYY-MM-DD.xlsx",
  },
  {
    type: "tickets",
    label: "Support tickets",
    hint: "Requester and assignee names, subject, status, priority.",
    filenameExample: "IncluMarket_Support_Tickets_Report_YYYY-MM-DD.xlsx",
  },
  {
    type: "audit_logs",
    label: "Audit logs",
    hint: "Actor name/role and actions (latest 5,000 rows).",
    filenameExample: "IncluMarket_Audit_Logs_Report_YYYY-MM-DD.xlsx",
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

export function AdminReportsClient() {
  const [busy, setBusy] = useState<ReportType | null>(null);

  async function onExport(type: ReportType) {
    setBusy(type);
    const res = await exportReport(type);
    setBusy(null);
    if (!res.ok || !res.fileBase64 || !res.filename) {
      toast(res.error || "Could not generate the report.", "error");
      return;
    }
    downloadBase64(res.fileBase64, res.filename);
    toast(`Downloaded ${res.filename}`, "success");
  }

  return (
    <div className="table-wrap">
      <table className="data-table" aria-label="Downloadable reports">
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
            <tr key={r.type}>
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
    </div>
  );
}

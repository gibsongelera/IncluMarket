"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { endFlashSale } from "@/lib/actions/seller";
import type { SellerFlashSaleLite } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { TableWrap } from "./TableWrap";

/** Seller Centre → Flash sales (C-34): what runs now, what is scheduled, what ended. */
export function SellerFlashSales({ sales, now }: { sales: SellerFlashSaleLite[]; now: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const state = (s: SellerFlashSaleLite) =>
    Date.parse(s.endsAt) <= now ? "Ended" : Date.parse(s.startsAt) > now ? "Scheduled" : "Running";

  async function end(s: SellerFlashSaleLite) {
    setBusy(s.id);
    const res = await endFlashSale(s.id);
    setBusy(null);
    if (!res.ok) return toast(res.error || "Could not end the sale.", "error");
    toast(state(s) === "Scheduled" ? "Scheduled sale cancelled." : "Sale ended. Prices are back to normal.", "success");
    router.refresh();
  }

  if (!sales.length) {
    return (
      <p className="empty">
        No flash sales yet. Start one from <Link href="/seller/products">Products</Link> → Flash sale.
      </p>
    );
  }
  return (
    <TableWrap label="Flash sales">
      <table className="data-table data-table--cards">
        <thead>
          <tr>
            <th>Product</th>
            <th>Discount</th>
            <th>Starts</th>
            <th>Ends</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => {
            const st = state(s);
            return (
              <tr key={s.id}>
                <td>{s.productTitle}</td>
                <td>{s.percent}% off</td>
                <td>{formatDateTime(s.startsAt)}</td>
                <td>{formatDateTime(s.endsAt)}</td>
                <td>
                  <span className={`pill pill--${st === "Running" ? "approved" : st === "Scheduled" ? "processing" : "cancelled"}`}>{st}</span>
                </td>
                <td>
                  {st === "Ended" ? (
                    <span className="muted small">—</span>
                  ) : (
                    <button type="button" className="btn btn--outline btn--sm" onClick={() => end(s)} disabled={busy === s.id}>
                      {st === "Scheduled" ? "Cancel" : "End now"}
                      <span className="sr-only">: {s.productTitle}</span>
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}

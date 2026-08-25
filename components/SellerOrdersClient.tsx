"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { money, formatDate, maskEmail } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Pill } from "./Pill";
import { updateOrderStatus } from "@/lib/actions/seller";
import { OrderTimeline } from "./OrderTimeline";
import type { Order, OrderItem, OrderStatus, OrderStatusHistoryEntry } from "@/lib/types";
import { TableWrap } from "./TableWrap";
import { Tabs, TabPanel } from "./Tabs";
import { DeepLinkFocus } from "./DeepLinkFocus";

type ProductLite = { id: number; title: string };
type VariantLite = { id: number; color_name: string; size: string | null };
type BuyerLite = { id: number; name: string; email: string };

const NEXT: Record<string, OrderStatus | undefined> = {
  pending: "processing",
  processing: "shipped",
  shipped: "delivered",
};

const TABS = ["all", "pending", "processing", "shipped", "delivered", "returned"];

export function SellerOrdersClient({
  orders,
  orderItems,
  products,
  variants,
  buyers,
  history,
}: {
  orders: Order[];
  orderItems: OrderItem[];
  products: ProductLite[];
  variants: VariantLite[];
  buyers: BuyerLite[];
  history: Record<number, OrderStatusHistoryEntry[]>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState(searchParams.get("status") ?? "all");
  const [busy, setBusy] = useState<number | null>(null);

  const filtered = filter === "all" ? orders : orders.filter((o) => o.order_status === filter);

  async function advance(orderId: number, status: OrderStatus, label: string) {
    setBusy(orderId);
    const res = await updateOrderStatus(orderId, status);
    setBusy(null);
    if (!res.ok) {
      toast(res.error || "Could not update.", "error");
      return;
    }
    toast(label, status === "returned" ? "warning" : "success");
    router.refresh();
  }

  return (
    <>
      <Tabs
        idPrefix="sorder"
        label="Order status"
        value={filter}
        onChange={setFilter}
        items={TABS.map((t) => ({
          value: t,
          label: t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1),
        }))}
      />
      <TabPanel idPrefix="sorder" value={filter}>
      <DeepLinkFocus />
      <TableWrap label="Orders">
        <table className="data-table data-table--cards" aria-label="Seller orders">
          <thead>
            <tr>
              <th>Order</th>
              <th>Buyer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
              <th>Tracking</th>
              <th>Advance</th>
            </tr>
          </thead>
          <tbody id="order-rows">
            {filtered.map((o) => {
              const buyer = buyers.find((b) => b.id === o.buyer_id);
              const items = orderItems.filter((it) => it.order_id === o.id);
              const next = NEXT[o.order_status];
              return (
                <tr key={o.id} data-row-id={o.id}>
                  <td>
                    <strong>#{o.id}</strong>
                    <br />
                    <small className="muted">{formatDate(o.created_at)}</small>
                  </td>
                  <td>
                    {buyer ? buyer.name : "Buyer"}
                    <br />
                    <small className="muted">{maskEmail(buyer ? buyer.email : "")}</small>
                  </td>
                  <td>
                    {items.map((it, idx) => {
                      const p = products.find((x) => x.id === it.product_id);
                      const v = variants.find((x) => x.id === it.variant_id);
                      return (
                        <span key={it.id}>
                          {idx > 0 ? <br /> : null}
                          {p ? p.title : "Item"}{" "}
                          <small className="muted">
                            x{it.quantity}
                            {v ? ` · ${v.color_name}/${v.size}` : ""}
                          </small>
                        </span>
                      );
                    })}
                  </td>
                  <td>{money(o.total_amount)}</td>
                  <td>
                    <Pill status={o.order_status} />
                  </td>
                  <td>
                    <details>
                      <summary className="muted small">History</summary>
                      <OrderTimeline order={o} history={history[o.id] || []} />
                    </details>
                  </td>
                  <td>
                    {next ? (
                      <button
                        className="btn btn--primary btn--sm"
                        disabled={busy === o.id}
                        onClick={() => advance(o.id, next, `Order #${o.id} → ${next}`)}
                      >
                        Mark {next}
                      </button>
                    ) : o.order_status === "delivered" ? (
                      <span className="muted small">Complete</span>
                    ) : (
                      <span className="muted small">Closed</span>
                    )}
                    {o.order_status === "delivered" ? (
                      <>
                        {" "}
                        <button
                          className="btn btn--ghost btn--sm"
                          disabled={busy === o.id}
                          onClick={() => {
                            if (confirm("Mark this order as returned?"))
                              advance(o.id, "returned", `Order #${o.id} marked returned.`);
                          }}
                        >
                          Mark returned
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      </TabPanel>
      {filtered.length === 0 ? <p className="empty">No orders in this status.</p> : null}
    </>
  );
}

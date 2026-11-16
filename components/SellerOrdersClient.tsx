"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { money, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Pill } from "./Pill";
import { updateOrderStatus } from "@/lib/actions/seller";
import { OrderTimeline } from "./OrderTimeline";
import { ConfirmDialog } from "./ConfirmDialog";
import { nextStates, type OrderState } from "@/lib/orders/state";
import type { Order, OrderItem, OrderStatusHistoryEntry } from "@/lib/types";
import { TableWrap } from "./TableWrap";
import { Tabs, TabPanel } from "./Tabs";
import { DeepLinkFocus } from "./DeepLinkFocus";

type ProductLite = { id: number; title: string };
type VariantLite = { id: number; color_name: string; size: string | null };
type BuyerLite = { id: number; name: string };

/**
 * One order as THIS seller may see it: their own lines' subtotal (never the
 * whole order total, which can include other sellers' items) and the shipping
 * destination they need to send the parcel. No buyer email.
 */
export type SellerOrderLite = Pick<
  Order,
  | "id"
  | "created_at"
  | "order_status"
  | "payment_status"
  | "payment_provider"
  | "buyer_id"
  | "shipping_name"
  | "shipping_address"
  | "shipping_city"
  | "shipping_phone"
  | "courier"
  | "tracking_number"
  | "delivered_at"
  | "return_reason"
  | "cancel_reason"
> & {
  subtotal: number;
  /** A PWD discount on this seller's lines: check the ID on delivery (C-26). */
  pwdCheck: { amount: number; last4: string | null } | null;
};

const TABS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "New" },
  { value: "processing", label: "To ship" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "return_requested", label: "Returns" },
  { value: "cancelled", label: "Cancelled" },
];

type Ask =
  | { kind: "ship"; order: SellerOrderLite }
  | { kind: "cancel"; order: SellerOrderLite }
  | { kind: "decline_return"; order: SellerOrderLite };

export function SellerOrdersClient({
  orders,
  orderItems,
  products,
  variants,
  buyers,
  history,
}: {
  orders: SellerOrderLite[];
  orderItems: OrderItem[];
  products: ProductLite[];
  variants: VariantLite[];
  buyers: BuyerLite[];
  history: Record<number, OrderStatusHistoryEntry[]>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // A status with no tab (the dashboard's donut can link to "returned")
  // falls back to All: with no tab selected, every tab would be tabIndex -1
  // and the tab list unreachable by keyboard.
  const asked = searchParams.get("status");
  const [filter, setFilter] = useState(asked && TABS.some((t) => t.value === asked) ? asked : "all");
  const [busy, setBusy] = useState<number | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [courier, setCourier] = useState("");
  const [tracking, setTracking] = useState("");

  const filtered = filter === "all" ? orders : orders.filter((o) => o.order_status === filter);

  async function move(
    o: SellerOrderLite,
    to: OrderState,
    done: string,
    details: { courier?: string; trackingNumber?: string; reason?: string } = {}
  ): Promise<boolean> {
    setBusy(o.id);
    const res = await updateOrderStatus(o.id, to, details);
    setBusy(null);
    if (!res.ok) {
      if (ask) setAskError(res.error || "Could not update.");
      else toast(res.error || "Could not update.", "error");
      return false;
    }
    toast(done, "success");
    setAsk(null);
    router.refresh();
    return true;
  }

  function openAsk(next: Ask) {
    setAskError(null);
    setCourier(next.order.courier || "");
    setTracking(next.order.tracking_number || "");
    setAsk(next);
  }

  function actionsFor(o: SellerOrderLite) {
    const next = nextStates(o, "seller");
    const disabled = busy === o.id;
    const buttons: React.ReactNode[] = [];
    if (next.includes("processing"))
      buttons.push(
        <button key="accept" type="button" className="btn btn--primary btn--sm" disabled={disabled}
          onClick={() => move(o, "processing", `Order #${o.id} accepted. The buyer was told you're preparing it.`)}>
          Accept order
        </button>
      );
    if (next.includes("shipped"))
      buttons.push(
        <button key="ship" type="button" className="btn btn--primary btn--sm" disabled={disabled}
          onClick={() => openAsk({ kind: "ship", order: o })}>
          Ship…
        </button>
      );
    if (next.includes("delivered") && o.order_status === "shipped")
      buttons.push(
        <button key="delivered" type="button" className="btn btn--ghost btn--sm" disabled={disabled}
          onClick={() => move(o, "delivered", `Order #${o.id} marked delivered.`)}>
          Mark delivered
        </button>
      );
    if (next.includes("returned"))
      buttons.push(
        <button key="accept-return" type="button" className="btn btn--primary btn--sm" disabled={disabled}
          onClick={() => move(o, "returned", `Return for order #${o.id} accepted.`, { reason: "Return accepted." })}>
          Accept return
        </button>
      );
    if (next.includes("delivered") && o.order_status === "return_requested")
      buttons.push(
        <button key="decline-return" type="button" className="btn btn--ghost btn--sm" disabled={disabled}
          onClick={() => openAsk({ kind: "decline_return", order: o })}>
          Decline return…
        </button>
      );
    if (next.includes("cancelled"))
      buttons.push(
        <button key="cancel" type="button" className="btn btn--ghost btn--sm" disabled={disabled}
          onClick={() => openAsk({ kind: "cancel", order: o })}>
          Cancel order…
        </button>
      );
    if (!buttons.length) {
      if (o.order_status === "pending" && o.payment_provider === "paymongo" && o.payment_status !== "paid")
        return <span className="muted small">Waiting for the buyer&apos;s payment</span>;
      return <span className="muted small">{o.order_status === "delivered" ? "Complete" : "No action needed"}</span>;
    }
    return <div className="row-actions">{buttons}</div>;
  }

  return (
    <>
      <Tabs idPrefix="sorder" label="Order status" value={filter} onChange={setFilter} items={TABS} />
      <TabPanel idPrefix="sorder" value={filter}>
        <DeepLinkFocus />
        <TableWrap label="Orders">
          <table className="data-table data-table--cards" aria-label="Seller orders">
            <thead>
              <tr>
                <th>Order</th>
                <th>Buyer</th>
                <th>Items</th>
                <th>Your items</th>
                <th>Status</th>
                <th>Tracking</th>
                <th>Next step</th>
              </tr>
            </thead>
            <tbody id="order-rows">
              {filtered.map((o) => {
                const buyer = buyers.find((b) => b.id === o.buyer_id);
                const items = orderItems.filter((it) => it.order_id === o.id);
                return (
                  <tr key={o.id} data-row-id={o.id}>
                    <td>
                      <strong>#{o.id}</strong>
                      <br />
                      <small className="muted">{formatDate(o.created_at)}</small>
                      <br />
                      <small className="muted">
                        {o.payment_provider === "paymongo"
                          ? o.payment_status === "paid"
                            ? "Paid online"
                            : "Online payment pending"
                          : "Cash on delivery"}
                      </small>
                    </td>
                    <td>
                      {buyer ? buyer.name : "Buyer"}
                      {o.shipping_city ? (
                        <>
                          <br />
                          <small className="muted">Ship to {o.shipping_city}</small>
                        </>
                      ) : null}
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
                              × {it.quantity}
                              {v ? ` · ${[v.color_name, v.size].filter(Boolean).join(" / ")}` : ""}
                            </small>
                          </span>
                        );
                      })}
                      {o.pwdCheck && o.payment_provider !== "paymongo" ? (
                        <p className="notice notice--warning small">
                          <strong>PWD discount applied (−{money(o.pwdCheck.amount)}).</strong> Check the buyer&rsquo;s PWD ID
                          on delivery{o.pwdCheck.last4 ? ` — ID ending ${o.pwdCheck.last4}` : ""}.
                        </p>
                      ) : o.pwdCheck ? (
                        <p className="muted small">Includes a PWD discount of {money(o.pwdCheck.amount)}.</p>
                      ) : null}
                      {o.return_reason && o.order_status === "return_requested" ? (
                        <p className="notice notice--warning small">Return reason: {o.return_reason}</p>
                      ) : null}
                      {o.order_status === "pending" || o.order_status === "processing" || o.order_status === "shipped" ? (
                        <p className="small">
                          <Link href={`/seller/orders/${o.id}/slip`}>
                            Packing slip<span className="sr-only"> for order #{o.id}</span>
                          </Link>
                        </p>
                      ) : null}
                    </td>
                    <td className="price">{money(o.subtotal)}</td>
                    <td>
                      <Pill status={o.order_status} />
                    </td>
                    <td>
                      {o.tracking_number ? (
                        <>
                          {o.courier ? <span>{o.courier} · </span> : null}
                          <code>{o.tracking_number}</code>
                        </>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                      <details>
                        <summary className="muted small">History</summary>
                        <OrderTimeline order={o} history={history[o.id] || []} />
                      </details>
                    </td>
                    <td>{actionsFor(o)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </TabPanel>
      {filtered.length === 0 ? <p className="empty">No orders in this status.</p> : null}

      {/* Ship: courier + tracking number, both visible and labelled. */}
      <ConfirmDialog
        open={ask?.kind === "ship"}
        title={ask ? `Ship order #${ask.order.id}` : ""}
        confirmLabel="Mark as shipped"
        busy={busy != null}
        error={askError}
        onCancel={() => setAsk(null)}
        onConfirm={() => {
          if (ask?.kind !== "ship") return;
          if (!tracking.trim()) {
            setAskError("Please enter the tracking number.");
            return;
          }
          void move(ask.order, "shipped", `Order #${ask.order.id} shipped. The buyer has the tracking number.`, {
            courier,
            trackingNumber: tracking,
          });
        }}
      >
        <div className="field">
          <label htmlFor="ship-courier">Courier</label>
          <input
            id="ship-courier"
            list="courier-options"
            maxLength={80}
            value={courier}
            onChange={(e) => setCourier(e.target.value)}
          />
          <datalist id="courier-options">
            <option value="J&T Express" />
            <option value="LBC" />
            <option value="Ninja Van" />
            <option value="Flash Express" />
            <option value="2GO" />
            <option value="Personal delivery" />
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="ship-tracking">
            Tracking number <span aria-hidden="true" className="req">*</span>
          </label>
          <input
            id="ship-tracking"
            required
            maxLength={80}
            autoComplete="off"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
          />
          <p className="hint">The buyer sees this in My Orders and in the shipping notification.</p>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={ask?.kind === "cancel"}
        title={ask ? `Cancel order #${ask.order.id}?` : ""}
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        tone="danger"
        busy={busy != null}
        error={askError}
        reason={{ label: "Reason (the buyer sees this)", required: true, minLength: 5, maxLength: 300 }}
        onCancel={() => setAsk(null)}
        onConfirm={(reason) => {
          if (ask?.kind !== "cancel") return;
          void move(ask.order, "cancelled", `Order #${ask.order.id} cancelled. The items are back in stock.`, { reason });
        }}
      >
        <p>The items go back into stock. If the buyer already paid online, we will arrange the refund.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={ask?.kind === "decline_return"}
        title={ask ? `Decline the return for order #${ask.order.id}?` : ""}
        confirmLabel="Decline return"
        tone="danger"
        busy={busy != null}
        error={askError}
        reason={{ label: "Why are you declining? (the buyer sees this)", required: true, minLength: 5, maxLength: 300 }}
        onCancel={() => setAsk(null)}
        onConfirm={(reason) => {
          if (ask?.kind !== "decline_return") return;
          void move(ask.order, "delivered", `Return for order #${ask.order.id} declined.`, { reason });
        }}
      >
        <p>The buyer can still contact support if they disagree.</p>
      </ConfirmDialog>
    </>
  );
}

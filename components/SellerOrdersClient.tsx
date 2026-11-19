"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { money, formatDate, initials } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Pill } from "./Pill";
import { updateOrderStatus } from "@/lib/actions/seller";
import { OrderTimeline } from "./OrderTimeline";
import { ConfirmDialog } from "./ConfirmDialog";
import { nextStates, type OrderState } from "@/lib/orders/state";
import { SLIP_STATUSES, type SellerOrderRow, type SellerOrdersEmpty } from "@/lib/seller-list-types";
import { TableWrap } from "./TableWrap";
import { DeepLinkFocus } from "./DeepLinkFocus";
import { RowActions } from "./RowActions";
import { useRowFocus } from "./useRowFocus";

type Ask =
  | { kind: "ship"; order: SellerOrderRow }
  | { kind: "cancel"; order: SellerOrderRow }
  | { kind: "decline_return"; order: SellerOrderRow };

/** How the buyer pays, in words. */
function paymentWords(o: SellerOrderRow): string {
  if (o.payment_provider !== "paymongo") return "Cash on delivery";
  return o.payment_status === "paid" ? "Paid online" : "Online payment pending";
}

/**
 * Seller Centre → Orders (P3-05, 04 §6): one page of this seller's orders,
 * already filtered, searched and paged on the server (lib/seller-lists.ts),
 * with every per-order step in the row's Actions: accept, ship (courier and
 * tracking), mark delivered, accept or decline a return, the packing slip
 * and cancel.
 */
export function SellerOrdersClient({ rows, empty }: { rows: SellerOrderRow[]; empty: SellerOrdersEmpty }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  // A step already on its way: the row's buttons do nothing until it lands.
  // Not `disabled`: disabling the focused button would drop focus to <body>.
  const inFlight = useRef(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [courier, setCourier] = useState("");
  const [tracking, setTracking] = useState("");

  // Where focus goes when a step takes the order off this tab (accepted on
  // New, shipped on To ship, a return settled on Returns).
  const focus = useRowFocus(rows);

  async function move(
    o: SellerOrderRow,
    to: OrderState,
    done: string,
    details: { courier?: string; trackingNumber?: string; reason?: string } = {}
  ): Promise<boolean> {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(o.id);
    // Before the await: the refreshed rows can land before it resolves.
    focus.mark(o.id);
    const res = await updateOrderStatus(o.id, to, details);
    inFlight.current = false;
    setBusy(null);
    if (!res.ok) {
      focus.clear();
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
    if (inFlight.current) return;
    setAskError(null);
    setCourier(next.order.courier || "");
    setTracking(next.order.tracking_number || "");
    setAsk(next);
  }

  /**
   * The row's steps, each keyed: when an order moves on, the button in its
   * place is a new one (Accept order gives way to Ship…), never the old one
   * relabelled under the pointer or focus.
   */
  function actionsFor(o: SellerOrderRow): ReactNode[] {
    const next = nextStates(o, "seller");
    const out: ReactNode[] = [];
    if (next.includes("processing"))
      out.push(
        <button key="accept" type="button" className="btn btn--primary btn--sm"
          onClick={() => move(o, "processing", `Order #${o.id} accepted. The buyer was told you're preparing it.`)}>
          Accept order
        </button>
      );
    if (next.includes("shipped"))
      out.push(
        <button key="ship" type="button" className="btn btn--primary btn--sm"
          onClick={() => openAsk({ kind: "ship", order: o })}>
          Ship…
        </button>
      );
    if (next.includes("delivered") && o.order_status === "shipped")
      out.push(
        <button key="delivered" type="button" className="btn btn--ghost btn--sm"
          onClick={() => move(o, "delivered", `Order #${o.id} marked delivered.`)}>
          Mark delivered
        </button>
      );
    if (next.includes("returned"))
      out.push(
        <button key="accept-return" type="button" className="btn btn--primary btn--sm"
          onClick={() => move(o, "returned", `Return for order #${o.id} accepted.`, { reason: "Return accepted." })}>
          Accept return
        </button>
      );
    if (next.includes("delivered") && o.order_status === "return_requested")
      out.push(
        <button key="decline-return" type="button" className="btn btn--ghost btn--sm"
          onClick={() => openAsk({ kind: "decline_return", order: o })}>
          Decline return…
        </button>
      );
    if (SLIP_STATUSES.includes(o.order_status))
      out.push(
        <Link key="slip" className="btn btn--outline btn--sm" href={`/seller/orders/${o.id}/slip`}>
          Packing slip
          {/* A no-break space: .sr-only is absolutely positioned, so a plain
              leading space collapses (as in RowActions). The link may stand
              alone in the cell, so it names its order. */}
          <span className="sr-only">{` for order #${o.id}`}</span>
        </Link>
      );
    if (next.includes("cancelled"))
      out.push(
        <button key="cancel" type="button" className="btn btn--ghost btn--sm"
          onClick={() => openAsk({ kind: "cancel", order: o })}>
          Cancel order…
        </button>
      );
    return out;
  }

  // DeepLinkFocus stays on an empty list too: it moves focus to the page's
  // "not in this list" note when ?focus= names an order that is not here.
  if (!rows.length) {
    return (
      <>
        <DeepLinkFocus />
        <div className="empty">
          <p ref={focus.emptyRef} tabIndex={-1}>
            {empty.text}
          </p>
          {empty.href && empty.action ? (
            <Link className="btn btn--outline" href={empty.href}>
              {empty.action}
            </Link>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      <DeepLinkFocus />
      <TableWrap label="Orders">
        <table className="data-table data-table--cards" aria-label="Orders, newest first">
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Buyer</th>
              <th scope="col">Items</th>
              <th scope="col" className="num">
                Your subtotal
              </th>
              <th scope="col">Payment</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} data-row-id={o.id}>
                <td>
                  <strong className="cell-code">#{o.id}</strong>
                  <div className="small muted">{formatDate(o.created_at)}</div>
                </td>
                <td>
                  <div className="cell-identity">
                    <span className="avatar" aria-hidden="true">
                      {initials(o.buyerName)}
                    </span>
                    <span className="cell-identity__text">
                      <span className="cell-identity__name">{o.buyerName}</span>
                      {o.shipping_city ? <span className="cell-identity__meta">Ship to {o.shipping_city}</span> : null}
                    </span>
                  </div>
                </td>
                <td>
                  {o.items.map((it, idx) => (
                    <span key={it.id}>
                      {idx > 0 ? <br /> : null}
                      {it.title}{" "}
                      <small className="muted">
                        × {it.quantity}
                        {it.option ? ` · ${it.option}` : ""}
                      </small>
                    </span>
                  ))}
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
                </td>
                <td className="num">{money(o.subtotal)}</td>
                <td>{paymentWords(o)}</td>
                <td>
                  <Pill status={o.order_status} />
                  {/* Why there is no Accept or Cancel yet (both wait for the payment). */}
                  {o.order_status === "pending" && o.payment_provider === "paymongo" && o.payment_status === "pending" ? (
                    <div className="small muted">Waiting for the buyer&apos;s payment</div>
                  ) : null}
                  {o.tracking_number ? (
                    <div className="small">
                      {o.courier ? <span>{o.courier} · </span> : null}
                      <code>{o.tracking_number}</code>
                    </div>
                  ) : null}
                  {o.cancel_reason && o.order_status === "cancelled" ? (
                    <div className="small muted">Cancelled: {o.cancel_reason}</div>
                  ) : null}
                  <details className="order-history">
                    <summary>
                      History
                      <span className="sr-only">{` of order #${o.id}`}</span>
                    </summary>
                    <OrderTimeline order={o} history={o.history} />
                  </details>
                </td>
                <td className="cell-actions">
                  <RowActions label={`order #${o.id}`}>{actionsFor(o)}</RowActions>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

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

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { money, formatDateTime, svgPlaceholder } from "@/lib/format";
import { toast } from "@/lib/toast";
import { StarInput } from "./StarInput";
import { addReview } from "@/lib/actions/shop";
import { abandonPayment, retryPayment } from "@/lib/actions/payments-buyer";
import { cancelOrder, confirmOrderReceived, requestReturn } from "@/lib/actions/orders";
import { OrderTimeline } from "./OrderTimeline";
import { ConfirmDialog } from "./ConfirmDialog";
import { BUYER_TABS, buyerStatusText, buyerTab, canTransition, type BuyerTab } from "@/lib/orders/state";
import type { Order, OrderItem, OrderStatusHistoryEntry } from "@/lib/types";
import { Tabs, TabPanel } from "./Tabs";

type ProductLite = { id: number; title: string; image: string | null; images: string[] | null };
type VariantLite = { id: number; color_name: string; size: string | null };

type Ask = { kind: "cancel" | "return" | "received"; order: Order };

const TABS: { value: "all" | BuyerTab; label: string }[] = [{ value: "all", label: "All" }, ...BUYER_TABS];

function imgSrc(p?: ProductLite): string {
  if (p?.images && p.images.length) return p.images[0];
  return svgPlaceholder(p?.image);
}

export function OrdersClient({
  orders,
  orderItems,
  products,
  variants,
  reviewedProductIds,
  history,
}: {
  orders: Order[];
  orderItems: OrderItem[];
  products: ProductLite[];
  variants: VariantLite[];
  reviewedProductIds: number[];
  history: Record<number, OrderStatusHistoryEntry[]>;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("all");
  const [reviewed, setReviewed] = useState<number[]>(reviewedProductIds);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [modalProduct, setModalProduct] = useState<number | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const handledReturn = useRef(false);

  // Returning from PayMongo after "Pay now": ?cancelled=<id> releases the hold
  // again; ?paid=<id> just confirms (the webhook does the real work).
  useEffect(() => {
    if (handledReturn.current) return;
    handledReturn.current = true;
    const params = new URLSearchParams(window.location.search);
    const cancelled = Number(params.get("cancelled"));
    if (Number.isInteger(cancelled) && cancelled > 0) {
      void abandonPayment(cancelled).then(() => {
        toast("Payment cancelled. Nothing was charged.", "info");
        router.replace("/buyer/orders");
      });
    } else if (params.get("paid")) {
      toast("Thank you! We'll confirm as soon as PayMongo tells us the payment went through.", "success");
      router.replace("/buyer/orders");
    } else if (params.get("placed")) {
      router.replace("/buyer/orders");
    }
  }, [router]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const o of orders) c[buyerTab(o)] = (c[buyerTab(o)] || 0) + 1;
    return c;
  }, [orders]);

  const filtered = useMemo(
    () => (filter === "all" ? orders : orders.filter((o) => buyerTab(o) === filter)),
    [orders, filter]
  );

  const productById = (id: number | null) => products.find((p) => p.id === id);
  const variantById = (id: number | null) => variants.find((v) => v.id === id);

  function awaitingPayment(o: Order): boolean {
    return (
      o.payment_provider === "paymongo" &&
      o.order_status === "pending" &&
      (o.payment_status === "pending" || o.payment_status === "failed")
    );
  }

  async function payNow(orderId: number) {
    setPayingId(orderId);
    const res = await retryPayment(orderId);
    if (!res.ok || !res.redirectUrl) {
      setPayingId(null);
      toast(res.error || "Could not start the payment.", "error");
      router.refresh();
      return;
    }
    window.location.href = res.redirectUrl;
  }

  async function runAsk(reason: string) {
    if (!ask) return;
    setBusy(true);
    const id = ask.order.id;
    const res =
      ask.kind === "cancel"
        ? await cancelOrder(id, reason)
        : ask.kind === "return"
          ? await requestReturn(id, reason)
          : await confirmOrderReceived(id);
    setBusy(false);
    if (!res.ok) {
      setAskError(res.error || "That did not work. Please try again.");
      return;
    }
    toast(
      ask.kind === "cancel"
        ? `Order #${id} cancelled.`
        : ask.kind === "return"
          ? `Return requested for order #${id}. The seller will reply soon.`
          : `Thanks! Order #${id} is complete. You can now review what you bought.`,
      "success"
    );
    setAsk(null);
    router.refresh();
  }

  function openReview(productId: number) {
    setModalProduct(productId);
    setRating(5);
    setComment("");
    dialogRef.current?.showModal();
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) {
      toast("Please write a short comment.", "warning");
      return;
    }
    if (modalProduct == null) return;
    setBusy(true);
    const res = await addReview(modalProduct, rating, comment.trim());
    setBusy(false);
    if (!res.ok) {
      toast(res.error || "Could not submit review.", "error");
      return;
    }
    setReviewed((r) => [...r, modalProduct]);
    toast("Review submitted. Thank you!", "success");
    dialogRef.current?.close();
    router.refresh();
  }

  return (
    <>
      <Tabs
        idPrefix="order"
        label="Order status"
        value={filter}
        onChange={setFilter}
        items={TABS.map((t) => ({
          value: t.value,
          label: counts[t.value] ? `${t.label} (${counts[t.value]})` : t.label,
        }))}
      />

      <TabPanel idPrefix="order" value={filter}>
        {filtered.length === 0 ? (
          <div className="empty">
            <p>{orders.length === 0 ? "You have no orders yet." : "No orders here."}</p>
            {orders.length === 0 ? (
              <Link href="/home" className="btn btn--primary">
                Start shopping
              </Link>
            ) : null}
          </div>
        ) : (
          <div id="orders-list">
            {filtered.map((o) => {
              const items = orderItems.filter((x) => x.order_id === o.id);
              const canCancel = canTransition(o, "cancelled", "buyer");
              const canReceive = canTransition(o, "delivered", "buyer");
              const canReturn = canTransition(o, "return_requested", "buyer");
              return (
                <article className="order-card" key={o.id} aria-labelledby={`order-${o.id}-title`}>
                  <header className="order-card__head">
                    <div>
                      <strong id={`order-${o.id}-title`}>Order #{o.id}</strong> &middot;{" "}
                      <span className="muted small">{formatDateTime(o.created_at)}</span>
                    </div>
                    <div>
                      <span className={`pill pill--${o.order_status}`}>{buyerStatusText(o)}</span>
                    </div>
                  </header>
                  {o.tracking_number && (o.order_status === "shipped" || o.order_status === "delivered") ? (
                    <p className="order-card__tracking">
                      {o.courier ? `${o.courier} · ` : ""}Tracking number <code>{o.tracking_number}</code>
                    </p>
                  ) : null}
                  {o.order_status === "cancelled" && o.cancel_reason ? (
                    <p className="muted small">Reason: {o.cancel_reason}</p>
                  ) : null}
                  <div className="order-card__body">
                    {items.map((it) => {
                      const p = productById(it.product_id);
                      const v = variantById(it.variant_id);
                      const already = it.product_id != null && reviewed.includes(it.product_id);
                      return (
                        <div className="order-card__line" key={it.id}>
                          <div className="order-card__thumb">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={imgSrc(p)} alt="" />
                          </div>
                          <div>
                            <strong>{p ? p.title : "Item"}</strong>
                            {v ? (
                              <div className="muted small">{[v.color_name, v.size].filter(Boolean).join(" · ")}</div>
                            ) : null}
                            <div className="muted small">
                              Qty {it.quantity} &middot; {money(it.unit_price)}
                            </div>
                          </div>
                          <div className="price">{money(it.quantity * it.unit_price)}</div>
                          <div>
                            {o.order_status === "delivered" && it.product_id != null ? (
                              already ? (
                                <span className="badge badge--success">Reviewed</span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn--ghost btn--sm"
                                  onClick={() => openReview(it.product_id as number)}
                                >
                                  Write review
                                </button>
                              )
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <OrderTimeline order={o} history={history[o.id] || []} />
                  <div className="order-card__foot">
                    <strong>Total: {money(o.total_amount)}</strong>
                    {awaitingPayment(o) ? (
                      <>
                        <span className="muted small">
                          {o.payment_status === "failed"
                            ? "Payment did not go through. Items are released until you pay."
                            : "Waiting for your online payment."}
                        </span>
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          disabled={payingId === o.id}
                          onClick={() => payNow(o.id)}
                        >
                          {payingId === o.id ? "Opening payment…" : "Pay now"}
                        </button>
                      </>
                    ) : null}
                    {canReceive ? (
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        onClick={() => {
                          setAskError(null);
                          setAsk({ kind: "received", order: o });
                        }}
                      >
                        Order received
                      </button>
                    ) : null}
                    {canReturn ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => {
                          setAskError(null);
                          setAsk({ kind: "return", order: o });
                        }}
                      >
                        Request a return
                      </button>
                    ) : null}
                    {canCancel ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => {
                          setAskError(null);
                          setAsk({ kind: "cancel", order: o });
                        }}
                      >
                        Cancel order
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </TabPanel>

      <ConfirmDialog
        open={ask?.kind === "cancel"}
        title={ask ? `Cancel order #${ask.order.id}?` : ""}
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        tone="danger"
        busy={busy}
        error={askError}
        reason={{
          label: "Why are you cancelling?",
          required: true,
          maxLength: 300,
          hint: "For example: ordered by mistake, found it cheaper, changed my mind.",
        }}
        onCancel={() => setAsk(null)}
        onConfirm={runAsk}
      >
        <p>You can cancel until the seller ships the order. Nothing is charged for a cancelled cash-on-delivery order.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={ask?.kind === "return"}
        title={ask ? `Return items from order #${ask.order.id}?` : ""}
        confirmLabel="Send return request"
        busy={busy}
        error={askError}
        reason={{
          label: "What is wrong with the order?",
          required: true,
          minLength: 5,
          maxLength: 500,
          hint: "The seller reads this before accepting the return.",
        }}
        onCancel={() => setAsk(null)}
        onConfirm={runAsk}
      >
        <p>You can request a return within 7 days of delivery. The seller accepts or declines; support can step in if you disagree.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={ask?.kind === "received"}
        title={ask ? `Did order #${ask.order.id} arrive?` : ""}
        confirmLabel="Yes, I received it"
        cancelLabel="Not yet"
        busy={busy}
        error={askError}
        onCancel={() => setAsk(null)}
        onConfirm={runAsk}
      >
        <p>Confirm only when the parcel is in your hands. You can still request a return for 7 days.</p>
      </ConfirmDialog>

      <dialog id="review-modal" className="modal" ref={dialogRef} aria-labelledby="review-modal-title">
        <form className="modal-form" id="review-form" onSubmit={submitReview}>
          <h2 id="review-modal-title">Leave a review</h2>
          <div className="field">
            <span id="review-rating-label" className="field__label">
              Rating
            </span>
            <StarInput value={rating} onChange={setRating} />
          </div>
          <div className="field">
            <label htmlFor="review-comment">Comment</label>
            <textarea
              id="review-comment"
              name="comment"
              rows={4}
              required
              maxLength={2000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            ></textarea>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" id="review-submit" disabled={busy}>
              Submit review
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

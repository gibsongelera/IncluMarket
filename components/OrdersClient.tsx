"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { money, formatDateTime, svgPlaceholder } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Pill } from "./Pill";
import { StarInput } from "./StarInput";
import { addReview } from "@/lib/actions/shop";
import { OrderTimeline } from "./OrderTimeline";
import type { Order, OrderItem, OrderStatus, OrderStatusHistoryEntry } from "@/lib/types";

type ProductLite = { id: number; title: string; image: string | null; images: string[] | null };
type VariantLite = { id: number; color_name: string; size: string | null };

const TABS: { status: string; label: string }[] = [
  { status: "all", label: "All" },
  { status: "pending", label: "Pending" },
  { status: "processing", label: "Processing" },
  { status: "shipped", label: "Shipped" },
  { status: "delivered", label: "Delivered" },
  { status: "returned", label: "Returned" },
];

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

  const filtered = useMemo(() => {
    const list = filter === "all" ? orders : orders.filter((o) => o.order_status === filter);
    return list;
  }, [orders, filter]);

  const productById = (id: number | null) => products.find((p) => p.id === id);
  const variantById = (id: number | null) => variants.find((v) => v.id === id);

  function openReview(productId: number) {
    setModalProduct(productId);
    setRating(5);
    setComment("");
    dialogRef.current?.showModal();
  }

  async function submitReview(e: React.MouseEvent) {
    e.preventDefault();
    if (!comment.trim()) {
      toast("Please write a comment.", "warning");
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
      <div className="tabs" role="tablist" id="order-tabs" aria-label="Order status">
        {TABS.map((t) => (
          <button
            key={t.status}
            role="tab"
            className={`tab ${filter === t.status ? "tab--active" : ""}`}
            aria-selected={filter === t.status}
            onClick={() => setFilter(t.status)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="empty">No orders yet.</p>
      ) : (
        <div id="orders-list">
          {filtered.map((o) => {
            const items = orderItems.filter((x) => x.order_id === o.id);
            return (
              <article className="order-card" key={o.id}>
                <header className="order-card__head">
                  <div>
                    <strong>Order #{o.id}</strong> &middot;{" "}
                    <span className="muted small">{formatDateTime(o.created_at)}</span>
                  </div>
                  <div>
                    <Pill status={o.order_status} />
                  </div>
                </header>
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
                            <div className="muted small">
                              {v.color_name} &middot; {v.size}
                            </div>
                          ) : null}
                          <div className="muted small">
                            Qty {it.quantity} &middot; {money(it.unit_price)}
                          </div>
                        </div>
                        <div>{money(it.quantity * it.unit_price)}</div>
                        <div>
                          {o.order_status === "delivered" ? (
                            already ? (
                              <span className="badge badge--success">Reviewed</span>
                            ) : (
                              <button
                                className="btn btn--ghost btn--sm"
                                onClick={() => it.product_id != null && openReview(it.product_id)}
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
                </div>
              </article>
            );
          })}
        </div>
      )}

      <dialog id="review-modal" className="modal" ref={dialogRef} aria-labelledby="review-modal-title">
        <form method="dialog" className="modal-form" id="review-form">
          <h2 id="review-modal-title">Leave a review</h2>
          <div className="field">
            <label htmlFor="review-rating">Rating</label>
            <StarInput value={rating} onChange={setRating} />
          </div>
          <div className="field">
            <label htmlFor="review-comment">Comment</label>
            <textarea
              id="review-comment"
              name="comment"
              rows={4}
              required
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            ></textarea>
          </div>
          <div className="form-actions">
            <button
              value="cancel"
              className="btn btn--ghost"
              onClick={(e) => {
                e.preventDefault();
                dialogRef.current?.close();
              }}
            >
              Cancel
            </button>
            <button
              value="submit"
              className="btn btn--primary"
              id="review-submit"
              disabled={busy}
              onClick={submitReview}
            >
              Submit review
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";
import { replyToReview } from "@/lib/actions/seller";
import { toast } from "@/lib/toast";
import type { ReviewLite } from "@/lib/reviews";
import { StarRating } from "./StarRating";

type ProductLite = { id: number; title: string };

/**
 * Seller Centre → Reviews. Metrics, filters, and a public reply under each
 * review (C-18). Buyers see the reply on the product page and are notified.
 */
export function SellerReviewsClient({ reviews, products }: { reviews: ReviewLite[]; products: ProductLite[] }) {
  const router = useRouter();
  const [product, setProduct] = useState("");
  const [min, setMin] = useState(0);
  const [onlyUnanswered, setOnlyUnanswered] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const sum = reviews.reduce((n, r) => n + r.rating, 0);
    const avg = reviews.length ? sum / reviews.length : 0;
    const unanswered = reviews.filter((r) => !r.sellerReply).length;
    return { avg, count: reviews.length, unanswered };
  }, [reviews]);

  const filtered = useMemo(
    () =>
      reviews.filter((r) => {
        if (product && String(r.productId) !== product) return false;
        if (min && r.rating < min) return false;
        if (onlyUnanswered && r.sellerReply) return false;
        return true;
      }),
    [reviews, product, min, onlyUnanswered]
  );

  function startReply(r: ReviewLite) {
    setEditing(r.id);
    setDraft(r.sellerReply ?? "");
    setError(null);
  }

  async function save(reviewId: number, text: string) {
    setBusy(true);
    setError(null);
    const res = await replyToReview(reviewId, text);
    setBusy(false);
    if (!res.ok) return setError(res.error || "Could not save your reply.");
    toast(text.trim() ? "Reply posted. The buyer has been told." : "Reply removed.", "success");
    setEditing(null);
    router.refresh();
  }

  return (
    <>
      <section className="kpis" aria-label="Review metrics">
        <article className="kpi">
          <span className="kpi__label">Average rating</span>
          <strong className="kpi__value">{stats.avg.toFixed(2)}</strong>
        </article>
        <article className="kpi">
          <span className="kpi__label">Total reviews</span>
          <strong className="kpi__value">{stats.count}</strong>
        </article>
        <article className="kpi">
          <span className="kpi__label">Waiting for your reply</span>
          <strong className="kpi__value">{stats.unanswered}</strong>
        </article>
      </section>

      <div className="filter-bar">
        <label htmlFor="rv-product">Product</label>
        <select id="rv-product" value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.title}
            </option>
          ))}
        </select>
        <label htmlFor="rv-min">Rating</label>
        <select id="rv-min" value={min} onChange={(e) => setMin(Number(e.target.value))}>
          <option value={0}>Any</option>
          <option value={1}>1 star and up</option>
          <option value={2}>2 stars and up</option>
          <option value={3}>3 stars and up</option>
          <option value={4}>4 stars and up</option>
          <option value={5}>5 stars</option>
        </select>
        <label className="radio">
          <input type="checkbox" checked={onlyUnanswered} onChange={(e) => setOnlyUnanswered(e.target.checked)} />
          Not yet replied
        </label>
        <span className="filter-bar__count muted small" role="status" aria-live="polite">
          {filtered.length} shown
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="empty">No reviews match this filter.</p>
      ) : (
        <div id="review-feed">
          {filtered.map((r) => {
            const p = products.find((x) => x.id === r.productId);
            const replyId = `reply-${r.id}`;
            return (
              <article className="review" key={r.id} data-row-id={r.id}>
                <header>
                  <strong>{r.reviewer}</strong>
                  {r.verifiedPurchase ? <span className="badge badge--verified">Verified purchase</span> : null}
                  <span className="muted small">{formatDate(r.createdAt)}</span>
                </header>
                <div className="muted small">Product: {p ? p.title : "(removed)"}</div>
                <StarRating score={r.rating} />
                {r.comment ? <p>{r.comment}</p> : null}

                {editing === r.id ? (
                  <form
                    className="review__reply-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void save(r.id, draft);
                    }}
                  >
                    <div className="field">
                      <label htmlFor={replyId}>Your public reply</label>
                      <textarea
                        id={replyId}
                        rows={3}
                        maxLength={1000}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        aria-describedby={`${replyId}-hint`}
                        autoFocus
                      />
                      <p className="hint" id={`${replyId}-hint`}>
                        Shown under the review on the product page. Thank the buyer, or say what you will do.
                      </p>
                    </div>
                    {error ? (
                      <p className="form-error" role="alert">
                        {error}
                      </p>
                    ) : null}
                    <div className="form-actions form-actions--start">
                      <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
                        {busy ? "Saving…" : "Post reply"}
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(null)} disabled={busy}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : r.sellerReply ? (
                  <div className="review__reply">
                    <p className="review__reply-label">
                      Your reply
                      {r.sellerReplyAt ? <span className="muted small"> · {formatDate(r.sellerReplyAt)}</span> : null}
                    </p>
                    <p>{r.sellerReply}</p>
                    <div className="form-actions form-actions--start">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => startReply(r)}>
                        Edit reply
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => save(r.id, "")} disabled={busy}>
                        Remove reply
                      </button>
                    </div>
                  </div>
                ) : (
                  <p>
                    <button type="button" className="btn btn--outline btn--sm" onClick={() => startReply(r)}>
                      Reply
                    </button>
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

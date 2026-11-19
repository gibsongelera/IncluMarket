"use client";

import { useState } from "react";
import type { RatingSummary, ReviewLite } from "@/lib/reviews";
import { formatDate } from "@/lib/format";
import { StarRating } from "./StarRating";

/**
 * Reviews on the product page (C-18): the average, a breakdown by stars in
 * which each row is a filter ("4 stars, 3 reviews"), and the list — each
 * review marked when it comes from a delivered order, with the seller's reply
 * underneath. Filtering is announced through the count, not by re-reading
 * the list.
 */
export function ReviewsSection({ reviews, summary }: { reviews: ReviewLite[]; summary: RatingSummary }) {
  const [stars, setStars] = useState<number | null>(null);
  const shown = stars ? reviews.filter((r) => Math.round(r.rating) === stars) : reviews;

  return (
    <section className="reviews" aria-labelledby="reviews-title">
      <h2 id="reviews-title">Customer reviews</h2>
      {summary.count === 0 ? (
        <p className="empty">No reviews yet. Reviews come only from buyers whose order was delivered.</p>
      ) : (
        <div className="reviews__layout">
          <div className="reviews__summary">
            <p className="reviews__average">
              <strong>{summary.average.toFixed(1)}</strong>
              <span className="sr-only"> out of 5, </span>
              <StarRating score={summary.average} />{" "}
              <span className="muted small">
                {summary.count} review{summary.count === 1 ? "" : "s"}
              </span>
            </p>
            <div className="reviews__breakdown" role="group" aria-label="Show reviews by rating">
              <button
                type="button"
                className="breakdown-row breakdown-row--all"
                aria-pressed={stars === null}
                onClick={() => setStars(null)}
              >
                All reviews ({summary.count})
              </button>
              {[5, 4, 3, 2, 1].map((s) => {
                const n = summary.byStars[s - 1];
                const pct = summary.count ? Math.round((n / summary.count) * 100) : 0;
                return (
                  <button
                    key={s}
                    type="button"
                    className="breakdown-row"
                    aria-pressed={stars === s}
                    disabled={n === 0}
                    onClick={() => setStars(stars === s ? null : s)}
                  >
                    <span className="breakdown-row__label">
                      {s} star{s === 1 ? "" : "s"}
                    </span>
                    <span className="breakdown-row__bar" aria-hidden="true">
                      <span style={{ width: `${pct}%` }} />
                    </span>
                    <span className="sr-only">: </span>
                    <span className="breakdown-row__count">
                      {n}
                      <span className="sr-only"> review{n === 1 ? "" : "s"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="reviews__list">
            <p className="muted small" role="status" aria-live="polite" aria-atomic="true">
              {stars
                ? `Showing ${shown.length} ${stars}-star review${shown.length === 1 ? "" : "s"}`
                : `Showing all ${shown.length} review${shown.length === 1 ? "" : "s"}`}
            </p>
            {shown.map((r) => (
              <article className="review" key={r.id}>
                <header>
                  <strong>{r.reviewer}</strong>
                  {r.verifiedPurchase ? <span className="badge badge--verified">Verified purchase</span> : null}
                  <span className="muted small">{formatDate(r.createdAt)}</span>
                </header>
                <StarRating score={r.rating} />
                {r.comment ? <p>{r.comment}</p> : null}
                {r.sellerReply ? (
                  <div className="review__reply">
                    <p className="review__reply-label">
                      Seller&rsquo;s reply{r.sellerReplyAt ? <span className="muted small"> · {formatDate(r.sellerReplyAt)}</span> : null}
                    </p>
                    <p>{r.sellerReply}</p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

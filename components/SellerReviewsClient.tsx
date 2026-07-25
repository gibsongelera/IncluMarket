"use client";

import { useMemo, useState } from "react";
import { formatDate, maskEmail } from "@/lib/format";
import { StarRating } from "./StarRating";
import type { ProductReview } from "@/lib/types";

type ProductLite = { id: number; title: string };
type BuyerLite = { id: number; name: string; email: string };

export function SellerReviewsClient({
  reviews,
  products,
  buyers,
}: {
  reviews: ProductReview[];
  products: ProductLite[];
  buyers: BuyerLite[];
}) {
  const [product, setProduct] = useState("");
  const [min, setMin] = useState(0);

  const stats = useMemo(() => {
    const sum = reviews.reduce((n, r) => n + r.rating_score, 0);
    const avg = reviews.length ? sum / reviews.length : 0;
    const fives = reviews.filter((r) => r.rating_score === 5).length;
    const fivePct = reviews.length ? Math.round((fives / reviews.length) * 100) : 0;
    return { avg, count: reviews.length, fivePct };
  }, [reviews]);

  const filtered = useMemo(() => {
    return reviews
      .filter((r) => {
        if (product && String(r.product_id) !== product) return false;
        if (min && r.rating_score < min) return false;
        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [reviews, product, min]);

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
          <span className="kpi__label">5-star share</span>
          <strong className="kpi__value">{stats.fivePct}%</strong>
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
        <label htmlFor="rv-min">Min rating</label>
        <select id="rv-min" value={min} onChange={(e) => setMin(Number(e.target.value))}>
          <option value={0}>Any</option>
          <option value={1}>1+</option>
          <option value={2}>2+</option>
          <option value={3}>3+</option>
          <option value={4}>4+</option>
          <option value={5}>5</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="empty">No reviews match this filter.</p>
      ) : (
        <div id="review-feed">
          {filtered.map((r) => {
            const buyer = buyers.find((b) => b.id === r.buyer_id);
            const p = products.find((x) => x.id === r.product_id);
            return (
              <article className="review" key={r.id}>
                <header>
                  <div>
                    <strong>{buyer ? buyer.name : "Buyer"}</strong> &middot;{" "}
                    <small className="muted">{maskEmail(buyer ? buyer.email : "")}</small>
                  </div>
                  <span className="muted small">{formatDate(r.created_at)}</span>
                </header>
                <div className="muted small">Product: {p ? p.title : "(deleted)"}</div>
                <StarRating score={r.rating_score} />
                <p>{r.comment_text}</p>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

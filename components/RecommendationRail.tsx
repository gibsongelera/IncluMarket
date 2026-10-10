import Link from "next/link";
import type { Recommendation } from "@/lib/recommend";
import { StorefrontGrid } from "./StorefrontGrid";

/**
 * "Recommended for you" / "Popular this week". A personalised rail always
 * says why it is there and how to turn it off (C-20, Q23).
 */
export function RecommendationRail({
  rec,
  wishlistIds,
  showWishlist,
}: {
  rec: Recommendation;
  wishlistIds: number[];
  showWishlist: boolean;
}) {
  if (!rec.items.length) return null;
  return (
    <section className="rail" aria-labelledby="rec-title">
      <div className="rail__head">
        <h2 id="rec-title">{rec.title}</h2>
      </div>
      {rec.reason ? (
        <details className="why">
          <summary>
            {rec.reason} <span className="why__more">— why am I seeing this?</span>
          </summary>
          <p>
            We suggest products from the categories you viewed, saved or bought in the last 90 days. Only you see
            these suggestions. You can turn them off in <Link href="/account#personalisation">your account</Link>.
          </p>
        </details>
      ) : null}
      <StorefrontGrid items={rec.items} wishlistIds={wishlistIds} showWishlist={showWishlist} labelledBy="rec-title" />
    </section>
  );
}

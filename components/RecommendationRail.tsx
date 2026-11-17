import Link from "next/link";
import type { Recommendation } from "@/lib/recommend";
import { ProductRail } from "./ProductRail";

/**
 * Picked for you (05 #9) as a product rail. The titles stay honest: the
 * personalised rail reads "Picked for you", the others what they are
 * ("Popular this week", "Popular picks"); lib/recommend.ts ranks by views,
 * saves, purchases and sales, so nothing here says AI. A personalised rail
 * always says why it is there and how to turn it off (C-20, Q23), in the
 * disclosure under its heading.
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
    <ProductRail
      id="rec-title"
      title={rec.personalised ? "Picked for you" : rec.title}
      label="picks"
      items={rec.items}
      wishlistIds={wishlistIds}
      showWishlist={showWishlist}
      meta={
        rec.reason ? (
          <details className="why">
            <summary>
              {rec.reason} <span className="why__more">— why am I seeing this?</span>
            </summary>
            <p>
              We suggest products from the categories you viewed, saved or bought in the last 90 days. Only you see
              these suggestions. You can turn them off in{" "}
              <Link href="/account/privacy#personalisation">Account → Privacy</Link>.
            </p>
          </details>
        ) : undefined
      }
    />
  );
}

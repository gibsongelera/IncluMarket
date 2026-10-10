import type { StorefrontItem } from "@/lib/storefront-core";
import { formatDateTime } from "@/lib/format";
import { Countdown } from "./Countdown";
import { StorefrontGrid } from "./StorefrontGrid";

/** Running flash sales, ending soonest first, with one countdown for the soonest. */
export function FlashSaleStrip({
  items,
  wishlistIds,
  showWishlist,
}: {
  items: StorefrontItem[];
  wishlistIds: number[];
  showWishlist: boolean;
}) {
  if (!items.length) return null;
  const soonest = items.find((i) => i.saleEndsAt)?.saleEndsAt ?? null;
  return (
    <section className="rail flash-strip" aria-labelledby="flash-title">
      <div className="rail__head">
        <h2 id="flash-title">Flash sale</h2>
        {soonest ? <Countdown endsAt={soonest} label={`First deal ends ${formatDateTime(soonest)}`} /> : null}
      </div>
      <StorefrontGrid items={items} wishlistIds={wishlistIds} showWishlist={showWishlist} labelledBy="flash-title" />
    </section>
  );
}

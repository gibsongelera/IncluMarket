import type { StorefrontItem } from "@/lib/storefront-core";
import { formatDateTime } from "@/lib/format";
import { Countdown } from "./Countdown";
import { ProductRail } from "./ProductRail";

/**
 * Today's deals (05 #5): running flash sales, ending soonest first, as a
 * product rail with one countdown, for the soonest end, beside the heading.
 * No "View all": no page lists every deal today (/search has no on-sale
 * filter), and the header never links to a page that does not show them.
 * Nothing on sale: nothing rendered.
 */
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
    <ProductRail
      id="flash-title"
      title="Today's deals"
      label="deals"
      items={items}
      wishlistIds={wishlistIds}
      showWishlist={showWishlist}
      capOnPhones={false}
      meta={soonest ? <Countdown endsAt={soonest} label={`First deal ends ${formatDateTime(soonest)}`} /> : undefined}
    />
  );
}

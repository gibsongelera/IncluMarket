import type { StorefrontItem } from "@/lib/storefront-core";
import { ProductCard } from "./ProductCard";

/**
 * The one product grid for storefront listings (home, search, shop pages,
 * rails). Takes the storefront DTO, so no page ever ships a whole product
 * row to the browser.
 */
export function StorefrontGrid({
  items,
  wishlistIds = [],
  showWishlist = true,
  labelledBy,
  wide = false,
}: {
  items: StorefrontItem[];
  wishlistIds?: number[];
  showWishlist?: boolean;
  labelledBy?: string;
  wide?: boolean;
}) {
  const saved = new Set(wishlistIds);
  return (
    <div className={`product-grid${wide ? " product-grid--wide" : ""}`} aria-labelledby={labelledBy}>
      {items.map((i) => (
        <ProductCard
          key={i.id}
          product={{ id: i.id, title: i.title, base_price: i.basePrice, created_at: i.createdAt, is_featured: i.isFeatured }}
          image={i.image}
          stock={i.stockTotal}
          rating={i.ratingAvg}
          ratingCount={i.ratingCount}
          soldCount={i.soldCount}
          flashSale={i.salePercent ? { discountPercent: i.salePercent } : null}
          verified={i.sellerVerified}
          wishlisted={saved.has(i.id)}
          showWishlist={showWishlist}
        />
      ))}
    </div>
  );
}

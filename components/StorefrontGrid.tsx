import type { StorefrontItem } from "@/lib/storefront-core";
import { ProductCard } from "./ProductCard";

/**
 * One storefront listing as a ProductCard. The grid below and the home
 * rails (ProductRail) both draw their cards with it, so a card in a rail
 * has exactly the props, wishlist heart included, it has in a grid.
 */
export function StorefrontCard({
  item: i,
  wishlisted,
  showWishlist,
}: {
  item: StorefrontItem;
  wishlisted: boolean;
  showWishlist: boolean;
}) {
  return (
    <ProductCard
      product={{ id: i.id, title: i.title, base_price: i.basePrice, created_at: i.createdAt, is_featured: i.isFeatured }}
      image={i.image}
      stock={i.stockTotal}
      rating={i.ratingAvg}
      ratingCount={i.ratingCount}
      soldCount={i.soldCount}
      flashSale={i.salePercent ? { discountPercent: i.salePercent } : null}
      verified={i.sellerVerified}
      wishlisted={wishlisted}
      showWishlist={showWishlist}
    />
  );
}

/**
 * The one product grid for storefront listings (home, search, shop pages,
 * rails). Takes the storefront DTO, so no page ever ships a whole product
 * row to the browser.
 *
 * The .product-list wrapper is the grid's query container: responsive.css
 * drops a column whenever the box is too narrow for each to be 7.5rem
 * (large text on a phone, or beside the /search filters), so a price is
 * never cut (1.4.10).
 */
export function StorefrontGrid({
  items,
  wishlistIds = [],
  showWishlist = true,
  wide = false,
}: {
  items: StorefrontItem[];
  wishlistIds?: number[];
  showWishlist?: boolean;
  wide?: boolean;
}) {
  const saved = new Set(wishlistIds);
  return (
    <div className="product-list">
      <div className={`product-grid${wide ? " product-grid--wide" : ""}`}>
        {items.map((i) => (
          <StorefrontCard key={i.id} item={i} wishlisted={saved.has(i.id)} showWishlist={showWishlist} />
        ))}
      </div>
    </div>
  );
}

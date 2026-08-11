import Link from "next/link";
import type { Product } from "@/lib/types";
import { money, productImageSrc } from "@/lib/format";
import { StarRating } from "./StarRating";

// Matches the original page.buyer-home.js cardHtml output.
export function ProductCard({
  product,
  stock,
  rating,
  ratingCount,
  categoryLabel,
}: {
  product: Product;
  stock: number;
  rating: number;
  ratingCount: number;
  categoryLabel: string;
}) {
  const isNew =
    Date.now() - new Date(product.created_at).getTime() <
    1000 * 60 * 60 * 24 * 45;
  const hasPhoto = Array.isArray(product.images) && product.images.length > 0;

  return (
    <Link className="product-card" href={`/buyer/product/${product.id}`}>
      <div className="product-card__thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={productImageSrc(product, 0)} alt={product.title} loading="lazy" />
        {isNew ? <span className="tag--new">New</span> : null}
        {hasPhoto ? null : (
          <span className="tag--placeholder" aria-hidden="true">
            Illustration
          </span>
        )}
      </div>
      <div className="product-card__body">
        <span className="product-card__cat">{categoryLabel}</span>
        <div className="product-card__title">{product.title}</div>
        <div className="product-card__price">{money(product.base_price)}</div>
        <div className="product-card__meta">
          <span>
            <StarRating score={rating} /> <small>({ratingCount})</small>
          </span>
          <span>
            {stock > 0 ? `${stock} in stock` : <em>Sold out</em>}
          </span>
        </div>
      </div>
    </Link>
  );
}

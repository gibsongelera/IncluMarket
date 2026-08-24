"use client";

import { useState } from "react";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { money, productImageSrc } from "@/lib/format";
import { toast } from "@/lib/toast";
import { toggleWishlistAction } from "@/lib/actions/wishlist";
import { StarRating } from "./StarRating";
import { Icon } from "./Icon";

// Matches the original page.buyer-home.js cardHtml output.
export function ProductCard({
  product,
  stock,
  rating,
  ratingCount,
  categoryLabel,
  wishlisted,
  showWishlist = true,
  flashSale,
}: {
  product: Product;
  stock: number;
  rating: number;
  ratingCount: number;
  categoryLabel: string;
  wishlisted?: boolean;
  showWishlist?: boolean;
  flashSale?: { discountPercent: number } | null;
}) {
  const [inWishlist, setInWishlist] = useState(Boolean(wishlisted));
  const [busy, setBusy] = useState(false);
  const isNew =
    Date.now() - new Date(product.created_at).getTime() <
    1000 * 60 * 60 * 24 * 45;
  const hasPhoto = Array.isArray(product.images) && product.images.length > 0;

  async function onToggleWishlist(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    const res = await toggleWishlistAction(product.id);
    setBusy(false);
    if (!res.ok) {
      toast(res.error || "Could not update wishlist.", "error");
      return;
    }
    setInWishlist(Boolean(res.inWishlist));
    toast(res.inWishlist ? "Saved to wishlist." : "Removed from wishlist.", "success");
  }

  return (
    <article className="product-card">
      {showWishlist ? (
        <button
          type="button"
          className="icon-btn product-card__wishlist"
          aria-pressed={inWishlist}
          aria-label={inWishlist ? `Remove ${product.title} from wishlist` : `Save ${product.title} to wishlist`}
          onClick={onToggleWishlist}
          disabled={busy}
        >
          <Icon name={inWishlist ? "heart-filled" : "heart"} size={18} />
        </button>
      ) : null}
      <Link
        className="product-card__link"
        href={`/buyer/product/${product.id}`}
        scroll={false}
        prefetch
      >
        <div className="product-card__thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={productImageSrc(product, 0)} alt={product.title} loading="lazy" />
          {product.is_featured ? (
            <span className="badge badge--featured product-card__featured">
              <Icon name="sparkles" size={14} /> Featured
            </span>
          ) : null}
          {isNew ? <span className="tag--new">New</span> : null}
          {hasPhoto ? null : (
            <span className="tag--placeholder" aria-hidden="true">
              Illustration
            </span>
          )}
        </div>
        <div className="product-card__body">
          <span className="product-card__cat">{categoryLabel}</span>
          <h3 className="product-card__title">{product.title}</h3>
          <div className="product-card__price">
            {flashSale ? (
              <>
                <span className="product-card__price--sale">
                  {money(product.base_price * (1 - flashSale.discountPercent / 100))}
                </span>
                <span className="product-card__price--original">{money(product.base_price)}</span>
                <span className="badge badge--red">-{flashSale.discountPercent}%</span>
              </>
            ) : (
              money(product.base_price)
            )}
          </div>
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
    </article>
  );
}

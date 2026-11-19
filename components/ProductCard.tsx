"use client";

import { useState } from "react";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { money } from "@/lib/format";
import { applyPercentOff } from "@/lib/pricing/core";
import { toast } from "@/lib/toast";
import { toggleWishlistAction } from "@/lib/actions/wishlist";
import { StarRating } from "./StarRating";
import { Icon } from "./Icon";

/** "1,234" → "1.2k" — the compact sold count Shopee buyers expect. */
export function compactCount(n: number): string {
  if (n >= 1000) return `${(Math.floor(n / 100) / 10).toString().replace(/\.0$/, "")}k`;
  return String(n);
}

/**
 * Product card (§7 anatomy).
 *
 * The whole card is one link whose accessible name is the title; the photo is
 * decorative (alt="") so a screen reader does not read the title twice. Price
 * changes are spoken ("was ₱899"), never shown by colour or strike-through
 * alone. When there is no photo the card shows a neutral tile with the
 * product's initial instead of an emoji.
 */
export function ProductCard({
  product,
  stock,
  rating,
  ratingCount,
  soldCount = 0,
  wishlisted,
  showWishlist = true,
  flashSale,
  sellerName,
  verified = false,
  image,
}: {
  product: Pick<Product, "id" | "title" | "base_price" | "created_at" | "is_featured"> & { images?: string[] };
  stock: number;
  rating: number;
  ratingCount: number;
  soldCount?: number;
  /** Legacy prop from older callers; the card no longer shows a category. */
  categoryLabel?: string;
  wishlisted?: boolean;
  showWishlist?: boolean;
  flashSale?: { discountPercent: number } | null;
  sellerName?: string | null;
  verified?: boolean;
  /** First photo; falls back to product.images[0]. */
  image?: string | null;
}) {
  const [inWishlist, setInWishlist] = useState(Boolean(wishlisted));
  // Animate the heart only after a tap, never on page load (M-13).
  const [heartTouched, setHeartTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const photo = image ?? product.images?.[0] ?? null;
  const isNew = Date.now() - new Date(product.created_at).getTime() < 1000 * 60 * 60 * 24 * 30;
  const initial = product.title.trim().charAt(0).toUpperCase() || "?";

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
    setHeartTouched(true);
    setInWishlist(Boolean(res.inWishlist));
    toast(res.inWishlist ? "Saved to your wishlist." : "Removed from your wishlist.", "success");
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
          <span key={inWishlist ? "on" : "off"} className={`icon-swap${heartTouched ? " icon-swap--animate" : ""}`}>
            <Icon name={inWishlist ? "heart-filled" : "heart"} size={18} />
          </span>
        </button>
      ) : null}
      <Link className="product-card__link" href={`/buyer/product/${product.id}`} prefetch={false}>
        <div className="product-card__thumb">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className="product-card__initial" aria-hidden="true">
              {initial}
            </span>
          )}
          {product.is_featured ? (
            <span className="badge badge--featured product-card__badge">Featured</span>
          ) : isNew ? (
            <span className="badge product-card__badge">New</span>
          ) : null}
          {stock <= 0 ? <span className="product-card__soldout">Sold out</span> : null}
        </div>
        <div className="product-card__body">
          <h3 className="product-card__title">{product.title}</h3>
          <p className="product-card__price">
            {flashSale ? (
              <>
                <span className="product-card__price--sale">
                  {money(applyPercentOff(product.base_price, flashSale.discountPercent))}
                </span>
                <s className="product-card__price--original">
                  <span className="sr-only">was </span>
                  {money(product.base_price)}
                </s>
                <span className="badge badge--sale">−{flashSale.discountPercent}%</span>
              </>
            ) : (
              money(product.base_price)
            )}
          </p>
          <p className="product-card__meta">
            <span>
              {ratingCount > 0 ? (
                <>
                  <StarRating score={rating} /> {rating.toFixed(1)}
                  <span className="sr-only"> from {ratingCount} review{ratingCount === 1 ? "" : "s"}</span>
                </>
              ) : (
                "No reviews yet"
              )}
            </span>
            {soldCount > 0 ? <span>{compactCount(soldCount)} sold</span> : null}
          </p>
          {verified ? (
            <p className="product-card__seller">
              <span className="badge badge--verified">
                <Icon name="check" size={12} /> Verified PWD seller
              </span>
            </p>
          ) : sellerName ? (
            <p className="product-card__seller">{sellerName}</p>
          ) : null}
        </div>
      </Link>
    </article>
  );
}

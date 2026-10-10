"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Product, ProductVariant } from "@/lib/types";
import { money, productImageSrc } from "@/lib/format";
import { applyPercentOff } from "@/lib/pricing/core";
import { addToCartAction } from "@/lib/actions/cart";
import { toggleWishlistAction } from "@/lib/actions/wishlist";
import { startConversation } from "@/lib/actions/messages";
import { toast } from "@/lib/toast";
import { StarRating } from "./StarRating";
import { Icon } from "./Icon";

export function ProductDetailClient({
  product,
  variants,
  sellerName,
  sellerVerified = false,
  categoryFolder,
  userId,
  rating = 0,
  ratingCount = 0,
  salePercent = null,
  wishlisted = false,
  soldCount = 0,
}: {
  product: Product;
  variants: ProductVariant[];
  sellerName: string;
  /** Active PWD verification (im_verified_pwd). */
  sellerVerified?: boolean;
  categoryFolder: string;
  userId?: number;
  rating?: number;
  ratingCount?: number;
  /** Active flash-sale percent, from the same table the server prices with. */
  salePercent?: number | null;
  /** Signed-in buyer has this listing in their wishlist. */
  wishlisted?: boolean;
  soldCount?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(wishlisted);
  const [saving, setSaving] = useState(false);

  async function toggleSaved() {
    if (requireLogin()) return;
    setSaving(true);
    const res = await toggleWishlistAction(product.id);
    setSaving(false);
    if (!res.ok) return toast(res.error || "Could not update your wishlist.", "error");
    setSaved(Boolean(res.inWishlist));
    toast(res.inWishlist ? "Saved to your wishlist." : "Removed from your wishlist.", "success");
    router.refresh();
  }

  function requireLogin(): boolean {
    if (userId) return false;
    toast("Sign in or create a free account to continue.", "info");
    router.push("/login");
    return true;
  }

  const colors = useMemo(() => {
    const c: string[] = [];
    variants.forEach((v) => {
      if (c.indexOf(v.color_name) < 0) c.push(v.color_name);
    });
    return c;
  }, [variants]);
  const sizes = useMemo(() => {
    const s: string[] = [];
    variants.forEach((v) => {
      if (v.size && s.indexOf(v.size) < 0) s.push(v.size);
    });
    return s;
  }, [variants]);

  const [color, setColor] = useState<string | null>(colors[0] || null);
  const [size, setSize] = useState<string | null>(sizes[0] || null);
  const [qty, setQty] = useState(1);
  const [gallery, setGallery] = useState(0);
  const [messaging, setMessaging] = useState(false);

  const images =
    Array.isArray(product.images) && product.images.length > 0
      ? product.images
      : [productImageSrc(product, 0)];

  const activeVariant = useMemo(
    () => variants.find((v) => v.color_name === color && v.size === size) || null,
    [variants, color, size]
  );

  function isColorAvailable(c: string) {
    return variants.some((v) => v.color_name === c && v.stock_qty > 0);
  }
  function isSizeAvailableForColor(s: string | null, c: string | null) {
    const v = variants.find((x) => x.color_name === c && x.size === s);
    return !!(v && v.stock_qty > 0);
  }

  function selectColor(c: string) {
    setColor(c);
    if (!isSizeAvailableForColor(size, c)) {
      const first = sizes.find((s) => isSizeAvailableForColor(s, c));
      if (first) setSize(first);
    }
  }

  function changeQty(delta: number) {
    let next = Math.max(1, qty + delta);
    if (activeVariant) next = Math.min(next, Math.max(1, activeVariant.stock_qty), 99);
    setQty(next);
  }

  // Switching to an option with less stock lowers the quantity to match.
  useEffect(() => {
    if (activeVariant && activeVariant.stock_qty > 0 && qty > activeVariant.stock_qty) setQty(activeVariant.stock_qty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVariant]);

  async function addToCart() {
    if (requireLogin()) return;
    if (!activeVariant || activeVariant.stock_qty <= 0 || busy) return;
    setBusy(true);
    const res = await addToCartAction(product.id, activeVariant.id, qty);
    setBusy(false);
    if (!res.ok) {
      toast(res.error || "Could not add to cart.", "error");
      return;
    }
    toast(res.notice || "Added to cart.", res.notice ? "info" : "success");
    router.refresh();
  }

  async function messageSeller() {
    if (requireLogin()) return;
    if (messaging) return;
    setMessaging(true);
    const res = await startConversation(product.seller_id, product.id);
    setMessaging(false);
    if (!res.ok) {
      toast(res.error || "Could not start conversation.", "error");
      return;
    }
    router.push(`/buyer/messages?c=${res.conversationId}`);
  }

  async function buyNow() {
    if (requireLogin()) return;
    if (!activeVariant || activeVariant.stock_qty <= 0 || busy) return;
    setBusy(true);
    const res = await addToCartAction(product.id, activeVariant.id, qty);
    setBusy(false);
    if (!res.ok) {
      toast(res.error || "Could not add to cart.", "error");
      return;
    }
    router.push("/buyer/checkout");
  }

  const v = activeVariant;
  const soldOut = !v || v.stock_qty <= 0;
  // A placeholder colour ("Standard") is not a choice; neither is a listing
  // sold in a single standard option (N-07).
  const placeholderColour = colors.length === 1 && /^(standard|default|one size)?$/i.test((colors[0] || "").trim());
  const hasOptions = !(placeholderColour && sizes.length === 0);
  const maxQty = v ? Math.max(1, Math.min(v.stock_qty, 99)) : 1;

  return (
    <div id="product-detail" className="product-detail">
      <div className="pd__gallery">
        <div
          className="pd__main"
          id="pd-photo"
          role={images.length > 1 ? "tabpanel" : undefined}
          aria-labelledby={images.length > 1 ? `pd-thumb-${gallery}` : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[gallery] || images[0]}
            alt={images.length > 1 ? `${product.title}, photo ${gallery + 1} of ${images.length}` : product.title}
          />
        </div>
        {images.length > 1 ? (
          // Photo thumbnails as a real tab list: one tab stop, arrow keys
          // move between photos (Home/End to the ends).
          <div className="pd__thumbs" role="tablist" aria-label="Product photos">
            {images.map((src, i) => (
              <button
                key={i}
                id={`pd-thumb-${i}`}
                type="button"
                role="tab"
                aria-selected={i === gallery}
                aria-controls="pd-photo"
                tabIndex={i === gallery ? 0 : -1}
                className={`pd__thumb ${i === gallery ? "is-active" : ""}`}
                aria-label={`Photo ${i + 1} of ${images.length}`}
                onClick={() => setGallery(i)}
                onKeyDown={(e) => {
                  const last = images.length - 1;
                  const to =
                    e.key === "ArrowRight" || e.key === "ArrowDown"
                      ? (i + 1) % images.length
                      : e.key === "ArrowLeft" || e.key === "ArrowUp"
                        ? (i - 1 + images.length) % images.length
                        : e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? last
                            : null;
                  if (to === null) return;
                  e.preventDefault();
                  setGallery(to);
                  document.getElementById(`pd-thumb-${to}`)?.focus();
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="pd__body">
        <span className="product-card__cat">{categoryFolder}</span>
        <div className="pd__title-row">
          <h1 className="pd__title">{product.title}</h1>
          <button
            type="button"
            className="icon-btn pd__wishlist"
            aria-pressed={saved}
            aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
            onClick={toggleSaved}
            disabled={saving}
          >
            <Icon name={saved ? "heart-filled" : "heart"} size={22} />
          </button>
        </div>
        <p className="muted pd__seller">
          Sold by{" "}
          <Link href={`/shop/${product.seller_id}`}>
            <strong>{sellerName}</strong>
          </Link>
          {sellerVerified ? (
            <span className="badge badge--verified">
              <Icon name="check" size={12} /> Verified PWD seller
            </span>
          ) : null}
        </p>
        <p className="pd__rating">
          <StarRating score={rating} /> <small>({ratingCount} review{ratingCount === 1 ? "" : "s"})</small>
          {soldCount > 0 ? <small> · {soldCount} sold</small> : null}
        </p>
        {salePercent ? (
          <p className="pd__price">
            <span className="price price--sale">{money(applyPercentOff(product.base_price, salePercent))}</span>{" "}
            <s className="price price--was">
              <span className="sr-only">was </span>
              {money(product.base_price)}
            </s>{" "}
            <span className="badge badge--sale">−{salePercent}%</span>
          </p>
        ) : (
          <p className="pd__price">
            <span className="price">{money(product.base_price)}</span>
          </p>
        )}
        <p className="pd__desc">{product.description}</p>

        {hasOptions && !placeholderColour ? (
        <div className="pd__section">
          <h3>
            Color: <span id="color-lbl">{color || ""}</span>
          </h3>
          <div className="variant-list" role="group" aria-label="Color">
            {colors.map((c) => {
              const enabled = isColorAvailable(c);
              return (
                <button
                  key={c}
                  type="button"
                  className="variant-btn"
                  aria-pressed={color === c}
                  disabled={!enabled}
                  aria-disabled={!enabled}
                  onClick={() => enabled && selectColor(c)}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        ) : null}

        {hasOptions && sizes.length ? (
          <div className="pd__section">
            <h3>
              Size: <span id="size-lbl">{size || ""}</span>
            </h3>
            <div className="size-list" role="group" aria-label="Size">
              {sizes.map((s) => {
                const enabled = isSizeAvailableForColor(s, color);
                return (
                  <button
                    key={s}
                    type="button"
                    className="variant-btn"
                    aria-pressed={size === s}
                    disabled={!enabled}
                    aria-disabled={!enabled}
                    onClick={() => enabled && setSize(s)}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="pd__section" id="stock-note">
          {!variants.length ? (
            <p className="stock-note stock-note--out">Not available to order right now.</p>
          ) : !v ? (
            <p className="stock-note stock-note--out">This combination is not available.</p>
          ) : v.stock_qty <= 0 ? (
            <p className="stock-note stock-note--out">Out of stock.</p>
          ) : v.stock_qty <= 5 ? (
            <p className="stock-note stock-note--low">
              Only {v.stock_qty} left (SKU {v.sku_code})
            </p>
          ) : (
            <p className="stock-note stock-note--ok">
              {v.stock_qty} in stock (SKU {v.sku_code})
            </p>
          )}
        </div>

        <div className="pd__section">
          <div className="qty-row">
            <label htmlFor="qty">Quantity</label>
            <div className="qty-ctrl">
              <button type="button" aria-label="Decrease quantity" onClick={() => changeQty(-1)} disabled={qty <= 1 || soldOut}>
                −
              </button>
              <input
                id="qty"
                type="number"
                inputMode="numeric"
                min={1}
                max={maxQty}
                value={qty}
                disabled={soldOut}
                aria-describedby="qty-hint"
                onChange={(e) => {
                  const n = Math.max(1, Math.min(maxQty, Math.floor(Number(e.target.value)) || 1));
                  setQty(n);
                }}
              />
              <button type="button" aria-label="Increase quantity" onClick={() => changeQty(1)} disabled={qty >= maxQty || soldOut}>
                +
              </button>
            </div>
            <span className="hint" id="qty-hint">
              {soldOut ? "" : `Up to ${maxQty}`}
            </span>
          </div>
        </div>

        <div className="pd__actions">
          <button
            type="button"
            className="btn btn--outline"
            id="add-to-cart"
            disabled={soldOut}
            aria-disabled={soldOut}
            onClick={addToCart}
          >
            Add to cart
          </button>
          <button
            type="button"
            className="btn btn--primary"
            id="buy-now"
            disabled={soldOut}
            aria-disabled={soldOut}
            onClick={buyNow}
          >
            Buy now
          </button>
          <button type="button" className="btn btn--ghost" disabled={messaging} onClick={messageSeller}>
            Message seller
          </button>
          <Link href="/home" className="btn btn--ghost">
            Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
}

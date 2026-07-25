"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Product, ProductVariant } from "@/lib/types";
import { money, productImageSrc } from "@/lib/format";
import { addItem } from "@/lib/cart";
import { toast } from "@/lib/toast";

export function ProductDetailClient({
  product,
  variants,
  sellerName,
  categoryFolder,
  userId,
}: {
  product: Product;
  variants: ProductVariant[];
  sellerName: string;
  categoryFolder: string;
  userId: number;
}) {
  const router = useRouter();

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
    if (activeVariant) next = Math.min(next, activeVariant.stock_qty);
    setQty(next);
  }

  function addToCart() {
    if (!activeVariant || activeVariant.stock_qty <= 0) return;
    addItem(userId, product.id, activeVariant.id, qty, product.base_price, activeVariant.stock_qty);
    toast("Added to cart.", "success");
  }

  function buyNow() {
    if (!activeVariant || activeVariant.stock_qty <= 0) return;
    addItem(userId, product.id, activeVariant.id, qty, product.base_price, activeVariant.stock_qty);
    router.push("/buyer/checkout");
  }

  const v = activeVariant;
  const soldOut = !v || v.stock_qty <= 0;

  return (
    <div id="product-detail" className="product-detail">
      <div className="pd__gallery">
        <div className="pd__main">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[gallery] || images[0]} alt={product.title} />
        </div>
        {images.length > 1 ? (
          <div className="pd__thumbs" role="tablist">
            {images.map((src, i) => (
              <button
                key={i}
                type="button"
                className={`pd__thumb ${i === gallery ? "is-active" : ""}`}
                aria-label={`Show image ${i + 1}`}
                onClick={() => setGallery(i)}
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
        <h1 className="pd__title">{product.title}</h1>
        <p className="muted">
          Sold by <strong>{sellerName}</strong>
        </p>
        <p className="pd__price">{money(product.base_price)}</p>
        <p className="pd__desc">{product.description}</p>

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

        {sizes.length ? (
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
          {!v ? (
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
          <label htmlFor="qty" className="sr-only">
            Quantity
          </label>
          <div className="qty-row">
            <span>Quantity:</span>
            <div className="qty-ctrl">
              <button type="button" aria-label="Decrease quantity" onClick={() => changeQty(-1)}>
                -
              </button>
              <input
                id="qty"
                type="number"
                min={1}
                value={qty}
                onChange={(e) => {
                  let n = Math.max(1, Number(e.target.value) || 1);
                  if (activeVariant) n = Math.min(n, activeVariant.stock_qty);
                  setQty(n);
                }}
              />
              <button type="button" aria-label="Increase quantity" onClick={() => changeQty(1)}>
                +
              </button>
            </div>
          </div>
        </div>

        <div className="pd__actions">
          <button
            type="button"
            className="btn btn--primary"
            id="add-to-cart"
            disabled={soldOut}
            aria-disabled={soldOut}
            onClick={addToCart}
          >
            Add to cart
          </button>
          <button
            type="button"
            className="btn btn--danger"
            id="buy-now"
            disabled={soldOut}
            aria-disabled={soldOut}
            onClick={buyNow}
          >
            Buy now
          </button>
          <Link href="/buyer/home" className="btn btn--ghost">
            Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
}

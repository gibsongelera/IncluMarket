"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { StorefrontItem } from "@/lib/storefront-core";
import type { WishlistVariantLite } from "@/lib/storefront";
import { moveWishlistToCartAction, removeFromWishlistAction } from "@/lib/actions/wishlist";
import { toast } from "@/lib/toast";
import { ProductCard } from "./ProductCard";

/**
 * The wishlist (C-15): saved listings with their current price (sale price
 * included), "Move to cart" — straight away for a single option, through a
 * variant picker otherwise — and saved items that are no longer for sale,
 * shown as such instead of silently disappearing.
 */
export function WishlistClient({
  items,
  unavailable,
  variants,
}: {
  items: StorefrontItem[];
  unavailable: { productId: number; title: string }[];
  variants: WishlistVariantLite[];
}) {
  const router = useRouter();
  const [picking, setPicking] = useState<StorefrontItem | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const optionsFor = (id: number) => variants.filter((v) => v.productId === id);

  async function move(item: StorefrontItem, variantId: number | null) {
    setBusy(item.id);
    const res = await moveWishlistToCartAction(item.id, variantId);
    setBusy(null);
    if (!res.ok) {
      toast(res.error || "Could not move it to your cart.", "error");
      return false;
    }
    toast(res.notice || `“${item.title}” moved to your cart.`, res.notice ? "warning" : "success");
    setPicking(null);
    router.refresh();
    return true;
  }

  function start(item: StorefrontItem) {
    const opts = optionsFor(item.id).filter((v) => v.stock > 0);
    if (opts.length === 1) void move(item, opts[0].id);
    else setPicking(item);
  }

  async function remove(productId: number, title: string) {
    setBusy(productId);
    const res = await removeFromWishlistAction(productId);
    setBusy(null);
    if (!res.ok) return toast(res.error || "Could not remove it.", "error");
    toast(`Removed “${title}” from your wishlist.`, "success");
    router.refresh();
  }

  if (!items.length && !unavailable.length) {
    return (
      <div className="empty">
        <p>Nothing saved yet. Tap the heart on any product to keep it here.</p>
        <p>
          <Link className="btn btn--primary" href="/home">
            Browse the shop
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      {items.length ? (
        <div className="product-list">
        <ul className="product-grid wishlist-grid" role="list" aria-label="Saved products">
          {items.map((i) => {
            const soldOut = i.stockTotal <= 0;
            return (
              <li key={i.id} className="wishlist-item">
                <ProductCard
                  product={{ id: i.id, title: i.title, base_price: i.basePrice, created_at: i.createdAt, is_featured: i.isFeatured }}
                  image={i.image}
                  stock={i.stockTotal}
                  rating={i.ratingAvg}
                  ratingCount={i.ratingCount}
                  soldCount={i.soldCount}
                  flashSale={i.salePercent ? { discountPercent: i.salePercent } : null}
                  verified={i.sellerVerified}
                  wishlisted
                  showWishlist={false}
                />
                <div className="wishlist-item__actions">
                  {soldOut ? (
                    <p className="wishlist-item__note">Sold out — we&rsquo;ll keep it here.</p>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={() => start(i)}
                      disabled={busy === i.id}
                      aria-label={`Move ${i.title} to cart`}
                    >
                      {busy === i.id ? "Moving…" : "Move to cart"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => remove(i.id, i.title)}
                    disabled={busy === i.id}
                    aria-label={`Remove ${i.title} from wishlist`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        </div>
      ) : null}

      {unavailable.length ? (
        <section className="wishlist-gone" aria-labelledby="wishlist-gone-title">
          <h2 id="wishlist-gone-title">No longer available</h2>
          <p className="muted">These were withdrawn or are not for sale right now.</p>
          <ul role="list">
            {unavailable.map((u) => (
              <li key={u.productId}>
                <span>{u.title}</span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => remove(u.productId, u.title)}
                  disabled={busy === u.productId}
                  aria-label={`Remove ${u.title} from wishlist`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <VariantPicker
        item={picking}
        options={picking ? optionsFor(picking.id) : []}
        busy={picking ? busy === picking.id : false}
        onCancel={() => setPicking(null)}
        onPick={(variantId) => (picking ? move(picking, variantId) : Promise.resolve(false))}
      />
    </>
  );
}

function VariantPicker({
  item,
  options,
  busy,
  onCancel,
  onPick,
}: {
  item: StorefrontItem | null;
  options: WishlistVariantLite[];
  busy: boolean;
  onCancel: () => void;
  onPick: (variantId: number | null) => Promise<boolean>;
}) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (item && !dlg.open) {
      setChoice(options.find((o) => o.stock > 0)?.id ?? null);
      setError(null);
      dlg.showModal();
    } else if (!item && dlg.open) {
      dlg.close();
    }
    // Options are read when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form
        className="modal-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (choice == null && options.length) return setError("Choose an option.");
          await onPick(choice);
        }}
      >
        <h2 id={`${id}-title`}>Choose an option</h2>
        <p>{item?.title}</p>
        <fieldset className="radio-group">
          <legend className="sr-only">Options for {item?.title}</legend>
          {options.map((o) => (
            <label key={o.id} className="radio">
              <input
                type="radio"
                name="variant"
                value={o.id}
                checked={choice === o.id}
                disabled={o.stock <= 0}
                onChange={() => setChoice(o.id)}
              />
              {o.label}
              <span className="muted small">{o.stock > 0 ? ` — ${o.stock} left` : " — sold out"}</span>
            </label>
          ))}
        </fieldset>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Moving…" : "Move to cart"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

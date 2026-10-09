"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "./Icon";
import { money, svgPlaceholder } from "@/lib/format";
import { toast } from "@/lib/toast";
import { removeFromCartAction, setCartQuantityAction } from "@/lib/actions/cart";
import type { PricedCart, PricedLine } from "@/lib/pricing/core";

function lineImage(line: PricedLine): string {
  return line.image || svgPlaceholder(null);
}

/**
 * The cart, grouped by seller. Every figure comes from the server-side
 * pricing engine (lib/pricing/engine.ts); this component only renders it and
 * asks the server to change quantities.
 */
export function CartClient({
  cart,
  sellerNames,
}: {
  cart: PricedCart;
  sellerNames: Record<number, string>;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function changeQty(line: PricedLine, quantity: number) {
    if (line.cartItemId == null || busyKey) return;
    setBusyKey(line.key);
    const res = await setCartQuantityAction(line.cartItemId, quantity);
    setBusyKey(null);
    if (!res.ok) {
      toast(res.error || "Could not update quantity.", "error");
      return;
    }
    if (res.notice) toast(res.notice, "info");
    router.refresh();
  }

  async function remove(line: PricedLine) {
    if (line.cartItemId == null || busyKey) return;
    setBusyKey(line.key);
    const res = await removeFromCartAction(line.cartItemId);
    setBusyKey(null);
    if (!res.ok) {
      toast(res.error || "Could not remove item.", "error");
      return;
    }
    toast(`Removed ${line.title}.`, "success");
    router.refresh();
  }

  if (cart.lines.length === 0) {
    return (
      <div className="empty" id="cart-empty">
        <p>Your cart is empty.</p>
        <Link href="/home" className="btn btn--primary">
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div id="cart-body">
      {cart.groups.map((g) => {
        const shop = sellerNames[g.sellerId] || "PWD Seller";
        return (
          <section className="cart-group" key={g.sellerId} aria-label={`Items from ${shop}`}>
            <header className="cart-group__head">
              <span aria-hidden="true">
                <Icon name="box" size={18} />
              </span>
              <strong>{shop}</strong>
              <span className="badge">
                {g.lines.length} item{g.lines.length > 1 ? "s" : ""}
              </span>
            </header>
            <div className="cart-group__body">
              {g.lines.map((line) => {
                const max = Math.max(1, Math.min(line.available, 99));
                const busy = busyKey === line.key;
                return (
                  <div className="cart-item" key={line.key}>
                    <div className="cart-item__thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={lineImage(line)} alt="" />
                    </div>
                    <div>
                      <div className="cart-item__title">
                        <Link href={`/buyer/product/${line.productId}`}>{line.title}</Link>
                      </div>
                      {line.variantLabel ? <div className="cart-item__meta">{line.variantLabel}</div> : null}
                      {line.problemText ? (
                        <p className="notice notice--warning cart-item__problem" role="status">
                          {line.problemText}
                        </p>
                      ) : null}
                    </div>
                    <div className="cart-item__price">
                      {line.sale ? (
                        <>
                          <span className="price price--sale">{money(line.unitPrice)}</span>{" "}
                          <s className="price price--was">
                            <span className="sr-only">was </span>
                            {money(line.baseUnitPrice)}
                          </s>
                        </>
                      ) : (
                        <span className="price">{money(line.unitPrice)}</span>
                      )}
                    </div>
                    {line.problem === "unavailable" || line.problem === "needs_option" ? (
                      <span aria-hidden="true" />
                    ) : (
                      <div className="qty-ctrl" role="group" aria-label={`Quantity of ${line.title}`}>
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          disabled={busy || line.quantity <= 1}
                          onClick={() => changeQty(line, line.quantity - 1)}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={max}
                          defaultValue={line.quantity}
                          key={`${line.key}-${line.quantity}`}
                          aria-label="Quantity"
                          disabled={busy}
                          onBlur={(e) => {
                            const n = Number(e.target.value);
                            if (n !== line.quantity) changeQty(line, n);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                        />
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          disabled={busy || line.quantity >= max}
                          onClick={() => changeQty(line, line.quantity + 1)}
                        >
                          +
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      aria-label={`Remove ${line.title}`}
                      disabled={busy}
                      onClick={() => remove(line)}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
            <footer className="cart-group__foot">
              Subtotal for this shop: <strong>{money(g.subtotal)}</strong>
              {g.shippingFee ? <> · Shipping {money(g.shippingFee)}</> : null}
            </footer>
          </section>
        );
      })}

      <div className="cart-summary--sticky">
        <span className="muted">
          {cart.itemCount} item{cart.itemCount === 1 ? "" : "s"}
          {cart.saleSavings > 0 ? <> · You save {money(cart.saleSavings)}</> : null}
        </span>
        <span className="total">Total: {money(cart.grandTotal)}</span>
        {cart.purchasable ? (
          <Link href="/buyer/checkout" className="btn btn--primary">
            Check out
          </Link>
        ) : (
          // No dead, disabled button: say what stands in the way instead. The
          // problem line itself is marked in the list above.
          <span className="cart-summary__blocked" role="status">
            <strong>Check out is paused</strong>
            <span className="hint">{cart.firstProblem}</span>
          </span>
        )}
      </div>
    </div>
  );
}

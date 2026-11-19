"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

/** A group checkbox that shows "some selected" (indeterminate). */
function GroupCheck({ checked, mixed, disabled, label, onChange }: { checked: boolean; mixed: boolean; disabled: boolean; label: string; onChange: (on: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <label className="cart-check">
      <input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="sr-only">{label}</span>
    </label>
  );
}

/**
 * The cart, grouped by seller. Every figure comes from the server-side
 * pricing engine (lib/pricing/engine.ts); this component only renders it and
 * asks the server to change quantities. Lines can be selected — by item, by
 * shop, or all — and checkout orders exactly the selected ones (C-29); a line
 * with a problem cannot be selected until it is fixed, but no longer blocks
 * checking out the rest.
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
  const selectable = useMemo(
    () => cart.lines.filter((l) => !l.problem && l.cartItemId != null).map((l) => l.cartItemId as number),
    [cart.lines]
  );
  const [selected, setSelected] = useState<Set<number>>(() => new Set(selectable));
  // After a quantity change or removal, drop ids that are gone or now blocked.
  useEffect(() => {
    setSelected((prev) => new Set([...prev].filter((id) => selectable.includes(id))));
  }, [selectable]);

  function toggle(ids: number[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on && selectable.includes(id)) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  const chosen = cart.lines.filter((l) => l.cartItemId != null && selected.has(l.cartItemId));
  const chosenGroups = cart.groups.filter((g) => g.lines.some((l) => l.cartItemId != null && selected.has(l.cartItemId)));
  const chosenItems = chosen.reduce((n, l) => n + l.quantity, 0);
  const chosenTotal =
    chosen.reduce((n, l) => n + l.lineTotal, 0) + chosenGroups.reduce((n, g) => n + g.shippingFee, 0);
  const allSelected = selectable.length > 0 && selectable.every((id) => selected.has(id));
  const checkoutHref =
    allSelected && selectable.length === cart.lines.length ? "/buyer/checkout" : `/buyer/checkout?items=${[...selected].join(",")}`;

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
      <div className="cart-selectall">
        <label className="radio">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={!selectable.length}
            onChange={(e) => toggle(selectable, e.target.checked)}
          />
          Select all ({selectable.length})
        </label>
      </div>
      {cart.groups.map((g) => {
        const shop = sellerNames[g.sellerId] || "PWD Seller";
        const ids = g.lines.filter((l) => !l.problem && l.cartItemId != null).map((l) => l.cartItemId as number);
        const on = ids.filter((id) => selected.has(id)).length;
        return (
          <section className="cart-group" key={g.sellerId} aria-label={`Items from ${shop}`}>
            <header className="cart-group__head">
              <GroupCheck
                checked={ids.length > 0 && on === ids.length}
                mixed={on > 0 && on < ids.length}
                disabled={!ids.length}
                label={`Select everything from ${shop}`}
                onChange={(v) => toggle(ids, v)}
              />
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
                    <label className="cart-check">
                      <input
                        type="checkbox"
                        checked={line.cartItemId != null && selected.has(line.cartItemId)}
                        disabled={Boolean(line.problem) || line.cartItemId == null}
                        onChange={(e) => line.cartItemId != null && toggle([line.cartItemId], e.target.checked)}
                      />
                      <span className="sr-only">
                        {line.problem ? `${line.title} cannot be selected until it is fixed` : `Select ${line.title}`}
                      </span>
                    </label>
                    <div className="cart-item__thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={lineImage(line)} alt="" />
                    </div>
                    <div>
                      <div className="cart-item__title">
                        <Link href={`/buyer/product/${line.productId}`}>{line.title}</Link>
                      </div>
                      {line.variantLabel ? <div className="cart-item__meta">{line.variantLabel}</div> : null}
                      {line.pwd ? (
                        <div className="pwd-line small">
                          PWD discount {line.pwd.ratePercent}%: −{money(line.pwd.unitDiscount * line.quantity)}
                          <span className="muted"> · {line.pwd.legalBasis}</span>
                        </div>
                      ) : null}
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

      {cart.pwdIfVerified ? (
        <p className="notice notice--info">
          Some items in your cart have a PWD discount.{" "}
          <Link href="/account/verification">Verify your PWD ID to get it</Link>.
        </p>
      ) : null}

      <div className="cart-summary--sticky">
        <span className="muted" role="status" aria-live="polite" aria-atomic="true">
          {chosenItems} item{chosenItems === 1 ? "" : "s"} selected
          {chosenGroups.length ? ` from ${chosenGroups.length} shop${chosenGroups.length === 1 ? "" : "s"}` : ""}
        </span>
        <span className="total">Total: {money(chosenTotal)}</span>
        {chosen.length ? (
          <Link href={checkoutHref} className="btn btn--primary">
            Check out ({chosenItems})
          </Link>
        ) : (
          // No dead, disabled button: say what stands in the way instead.
          <span className="cart-summary__blocked" role="status">
            <strong>{selectable.length ? "Select what to buy" : "Check out is paused"}</strong>
            <span className="hint">{selectable.length ? "Tick the items you want to check out." : cart.firstProblem}</span>
          </span>
        )}
      </div>
    </div>
  );
}

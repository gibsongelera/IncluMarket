"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { money, svgPlaceholder } from "@/lib/format";
import { toast } from "@/lib/toast";
import { placeOrder } from "@/lib/actions/shop";
import { SHIPPING_FEE } from "@/lib/pricing";
import type { CartItem } from "@/lib/types";

type ProductLite = { id: number; title: string; image: string | null; images: string[] | null };
type VariantLite = { id: number; color_name: string; size: string | null };

function imgSrc(p?: ProductLite): string {
  if (p?.images && p.images.length) return p.images[0];
  return svgPlaceholder(p?.image);
}

export function CheckoutClient({
  userName,
  items,
  products,
  variants,
  onlinePaymentEnabled,
}: {
  userName: string;
  items: CartItem[];
  products: ProductLite[];
  variants: VariantLite[];
  onlinePaymentEnabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (items.length === 0) {
    return (
      <p className="empty">
        Your cart is empty. <Link href="/buyer/cart">Back to cart</Link>
      </p>
    );
  }

  const sub = items.reduce((n, it) => n + it.unit_price * it.quantity, 0);
  const total = sub + SHIPPING_FEE;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    // These fields used to be collected, validated in the browser, and then
    // thrown away — placeOrder() was called with no arguments at all.
    const data = new FormData(form);
    setBusy(true);
    const res = await placeOrder({
      shippingName: String(data.get("name") ?? ""),
      shippingAddress: String(data.get("address") ?? ""),
      shippingCity: String(data.get("city") ?? ""),
      shippingPhone: String(data.get("phone") ?? ""),
      paymentMethod: data.get("payment") === "paymongo" ? "paymongo" : "cod",
    });

    if (!res.ok) {
      setBusy(false);
      toast(res.error || "Could not place order.", "error");
      return;
    }

    if (res.redirectUrl) {
      // Full navigation, not router.push — the destination is PayMongo, off-origin.
      toast("Redirecting you to the secure payment page…", "info");
      window.location.href = res.redirectUrl;
      return;
    }

    setBusy(false);
    toast(`Order ${res.orderId} placed. Thank you!`, "success");
    setTimeout(() => router.push("/buyer/orders"), 500);
  }

  return (
    <div className="checkout-grid">
      <form id="checkout-form" className="checkout-form" noValidate onSubmit={onSubmit}>
        <fieldset>
          <legend>Delivery details</legend>
          <div className="field">
            <label htmlFor="ck-name">Full name</label>
            <input id="ck-name" name="name" required defaultValue={userName} />
          </div>
          <div className="field">
            <label htmlFor="ck-address">Delivery address</label>
            <textarea id="ck-address" name="address" rows={3} required></textarea>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="ck-city">City</label>
              <input id="ck-city" name="city" required />
            </div>
            <div className="field">
              <label htmlFor="ck-phone">Contact number</label>
              <input id="ck-phone" name="phone" inputMode="tel" required />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Payment</legend>
          <div className="field">
            <label>
              <input type="radio" name="payment" value="cod" defaultChecked /> Cash on delivery
            </label>
          </div>
          <div className="field">
            <label>
              <input
                type="radio"
                name="payment"
                value="paymongo"
                disabled={!onlinePaymentEnabled}
                aria-describedby="pay-online-hint"
              />{" "}
              Pay online — GCash, Maya, GrabPay or card
            </label>
            <p id="pay-online-hint" className="hint">
              {onlinePaymentEnabled
                ? "You will be taken to PayMongo's secure page to pay, then brought back here. We never see or store your card details."
                : "Online payment is not configured on this deployment yet."}
            </p>
          </div>
        </fieldset>

        <div className="form-actions">
          <Link href="/buyer/cart" className="btn btn--ghost">
            Back to cart
          </Link>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            Place order
          </button>
        </div>
      </form>

      <aside className="checkout-summary" aria-labelledby="sum-title">
        <h2 id="sum-title">Order summary</h2>
        <div id="checkout-items">
          {items.map((it) => {
            const p = products.find((x) => x.id === it.product_id);
            const v = variants.find((x) => x.id === it.variant_id);
            const line = it.unit_price * it.quantity;
            return (
              <div
                key={`${it.product_id}-${it.variant_id}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: ".5rem",
                  padding: ".5rem 0",
                  borderBottom: "1px solid var(--border)",
                  alignItems: "center",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgSrc(p)}
                  alt=""
                  style={{
                    width: 44,
                    height: 44,
                    objectFit: "cover",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  {p ? p.title : "Item"} <small className="muted">x{it.quantity}</small>
                  {v ? (
                    <div className="muted small">
                      {v.color_name} · {v.size}
                    </div>
                  ) : null}
                </div>
                <div style={{ fontWeight: 700 }}>{money(line)}</div>
              </div>
            );
          })}
        </div>
        <dl className="totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{money(sub)}</dd>
          </div>
          <div>
            <dt>Shipping</dt>
            <dd>{money(SHIPPING_FEE)}</dd>
          </div>
          <div className="grand">
            <dt>Total</dt>
            <dd>{money(total)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}

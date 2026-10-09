"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { money, svgPlaceholder } from "@/lib/format";
import { toast } from "@/lib/toast";
import { placeOrder } from "@/lib/actions/shop";
import { abandonPayment } from "@/lib/actions/payments-buyer";
import type { PricedCart } from "@/lib/pricing/core";

export function CheckoutClient({
  userName,
  cart,
  sellerNames,
  onlinePaymentEnabled,
  cancelledOrderId,
}: {
  userName: string;
  cart: PricedCart;
  sellerNames: Record<number, string>;
  onlinePaymentEnabled: boolean;
  cancelledOrderId: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const handledCancel = useRef(false);

  // Coming back from PayMongo's "cancel" button: release the stock that order
  // was holding and say plainly that nothing was charged. The cancelUrl used to
  // be ignored, so abandoned payments held stock forever (B-06).
  useEffect(() => {
    if (!cancelledOrderId || handledCancel.current) return;
    handledCancel.current = true;
    void abandonPayment(cancelledOrderId).then((res) => {
      setCancelNotice(
        res.ok
          ? "Payment cancelled. Nothing was charged and your cart is still here."
          : res.error || "Payment cancelled."
      );
      router.replace("/buyer/checkout");
    });
  }, [cancelledOrderId, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const data = new FormData(form);
    setBusy(true);
    const res = await placeOrder({
      shippingName: String(data.get("name") ?? ""),
      shippingAddress: String(data.get("address") ?? ""),
      shippingCity: String(data.get("city") ?? ""),
      shippingPhone: String(data.get("phone") ?? ""),
      paymentMethod: data.get("payment") === "paymongo" ? "paymongo" : "cod",
      // Order exactly the lines priced on this page, even if the cart changed
      // in another tab since.
      cartItemIds: cart.lines.map((l) => l.cartItemId).filter((n): n is number => n != null),
    });

    if (!res.ok) {
      // The form keeps everything typed: the fields are uncontrolled and the
      // page is not reloaded, so a failure never costs the buyer their address.
      setBusy(false);
      toast(res.error || "Could not place order.", "error");
      return;
    }

    if (res.redirectUrl) {
      // Full navigation, not router.push — the destination is PayMongo, off-origin.
      toast("Taking you to the secure payment page…", "info");
      window.location.href = res.redirectUrl;
      return;
    }

    setBusy(false);
    toast(`Order ${res.orderId} placed. Thank you!`, "success");
    router.push(`/buyer/orders?placed=${res.orderId}`);
  }

  return (
    <div className="checkout-grid">
      <form id="checkout-form" className="checkout-form" noValidate onSubmit={onSubmit}>
        {cancelNotice ? (
          <p className="notice notice--info" role="status">
            {cancelNotice}
          </p>
        ) : null}
        <fieldset>
          <legend>Delivery details</legend>
          <div className="field">
            <label htmlFor="ck-name">Full name</label>
            <input id="ck-name" name="name" required autoComplete="name" defaultValue={userName} />
          </div>
          <div className="field">
            <label htmlFor="ck-address">Delivery address</label>
            <textarea
              id="ck-address"
              name="address"
              rows={3}
              required
              autoComplete="street-address"
              aria-describedby="ck-address-hint"
            ></textarea>
            <p id="ck-address-hint" className="hint">
              House number, street and barangay.
            </p>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="ck-city">City</label>
              <input id="ck-city" name="city" required autoComplete="address-level2" />
            </div>
            <div className="field">
              <label htmlFor="ck-phone">Contact number</label>
              <input
                id="ck-phone"
                name="phone"
                inputMode="tel"
                autoComplete="tel"
                required
                aria-describedby="ck-phone-hint"
              />
              <p id="ck-phone-hint" className="hint">
                For example 09171234567.
              </p>
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
                : "Online payment is not available right now."}
            </p>
          </div>
        </fieldset>

        {!cart.purchasable ? (
          <p className="notice notice--warning" role="status">
            {cart.firstProblem} <Link href="/buyer/cart">Go back to your cart</Link>.
          </p>
        ) : null}

        <div className="form-actions">
          <Link href="/buyer/cart" className="btn btn--ghost">
            Back to cart
          </Link>
          <button type="submit" className="btn btn--primary" disabled={busy || !cart.purchasable}>
            {busy ? "Placing order…" : `Place order · ${money(cart.grandTotal)}`}
          </button>
        </div>
      </form>

      <aside className="checkout-summary" aria-labelledby="sum-title">
        <h2 id="sum-title">Order summary</h2>
        {cart.groups.map((g) => (
          <section key={g.sellerId} className="checkout-group" aria-label={`From ${sellerNames[g.sellerId] || "PWD Seller"}`}>
            <h3 className="checkout-group__title">{sellerNames[g.sellerId] || "PWD Seller"}</h3>
            {g.lines.map((l) => (
              <div className="checkout-line" key={l.key}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="checkout-line__thumb" src={l.image || svgPlaceholder(null)} alt="" />
                <div className="checkout-line__body">
                  {l.title} <small className="muted">× {l.quantity}</small>
                  {l.variantLabel ? <div className="muted small">{l.variantLabel}</div> : null}
                  {l.sale ? <div className="muted small">{l.sale.percent}% flash sale</div> : null}
                </div>
                <div className="price">{money(l.lineTotal)}</div>
              </div>
            ))}
            <p className="checkout-group__ship muted small">
              Shipping from this shop: {money(g.shippingFee)}
            </p>
          </section>
        ))}
        <dl className="totals">
          <div>
            <dt>Subtotal</dt>
            <dd className="price">{money(cart.subtotal)}</dd>
          </div>
          <div>
            <dt>Shipping ({cart.groups.length} shop{cart.groups.length === 1 ? "" : "s"})</dt>
            <dd className="price">{money(cart.shippingTotal)}</dd>
          </div>
          <div className="grand">
            <dt>Total</dt>
            <dd className="price">{money(cart.grandTotal)}</dd>
          </div>
        </dl>
        {cart.saleSavings > 0 ? (
          <p className="muted small">The subtotal already includes {money(cart.saleSavings)} of flash sale savings.</p>
        ) : null}
      </aside>
    </div>
  );
}

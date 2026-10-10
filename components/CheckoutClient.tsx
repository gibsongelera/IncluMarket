"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { money, svgPlaceholder } from "@/lib/format";
import { toast } from "@/lib/toast";
import { placeOrder } from "@/lib/actions/shop";
import { saveAddress } from "@/lib/actions/account";
import { abandonPayment } from "@/lib/actions/payments-buyer";
import { addressLine, cleanAddress, type AddressField, type AddressLite } from "@/lib/address";
import type { PricedCart } from "@/lib/pricing/core";

const DRAFT_KEY = "im_checkout_draft";

type Fields = Record<AddressField, string>;
type Draft = { choice: number | "new"; fields: Fields; payment: "cod" | "paymongo"; save: boolean };

const FIELD_ORDER: AddressField[] = ["recipient", "phone", "line1", "barangay", "city", "province", "postalCode"];

/**
 * Checkout (C-29). Delivery to a saved address or a new one (optionally
 * saved), payment, and the order summary grouped by seller with each shop's
 * shipping. Everything typed is kept: on an error nothing is cleared, and a
 * draft lives in this tab's sessionStorage so leaving for PayMongo and
 * cancelling there brings the buyer back to a filled-in form.
 */
export function CheckoutClient({
  userName,
  cart,
  sellerNames,
  addresses,
  selection,
  onlinePaymentEnabled,
  cancelledOrderId,
}: {
  userName: string;
  cart: PricedCart;
  sellerNames: Record<number, string>;
  /** null before migration 0019 (no address book yet). */
  addresses: AddressLite[] | null;
  /** The cart lines chosen for this checkout, or null for the whole cart. */
  selection: number[] | null;
  onlinePaymentEnabled: boolean;
  cancelledOrderId: number | null;
}) {
  const router = useRouter();
  const saved = addresses ?? [];
  const firstSaved = saved.find((a) => a.isDefault) ?? saved[0] ?? null;
  const [choice, setChoice] = useState<number | "new">(firstSaved ? firstSaved.id : "new");
  const [fields, setFields] = useState<Fields>({
    label: "",
    recipient: userName,
    phone: "",
    line1: "",
    barangay: "",
    city: "",
    province: "",
    postalCode: "",
  });
  const [payment, setPayment] = useState<"cod" | "paymongo">("cod");
  const [save, setSave] = useState(addresses !== null);
  const [errors, setErrors] = useState<Partial<Record<AddressField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const handledCancel = useRef(false);
  const restored = useRef(false);

  // Restore a draft from this tab (e.g. back from a cancelled payment).
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = window.sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Partial<Draft>;
      if (d.fields) setFields((f) => ({ ...f, ...d.fields }));
      if (d.choice === "new" || (typeof d.choice === "number" && saved.some((a) => a.id === d.choice))) setChoice(d.choice);
      if (d.payment === "cod" || (d.payment === "paymongo" && onlinePaymentEnabled)) setPayment(d.payment);
      if (typeof d.save === "boolean") setSave(d.save && addresses !== null);
    } catch {
      // A broken or blocked draft is simply ignored.
    }
    // Restoring runs once, with the first render's props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the draft current.
  useEffect(() => {
    if (!restored.current) return;
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ choice, fields, payment, save } satisfies Draft));
    } catch {}
  }, [choice, fields, payment, save]);

  // Back from PayMongo's "cancel": release what that order was holding and
  // say plainly that nothing was charged (B-06).
  useEffect(() => {
    if (!cancelledOrderId || handledCancel.current) return;
    handledCancel.current = true;
    void abandonPayment(cancelledOrderId).then((res) => {
      setCancelNotice(
        res.ok
          ? "Payment cancelled. Nothing was charged. Your cart and delivery details are still here."
          : res.error || "Payment cancelled."
      );
      router.replace(selection ? `/buyer/checkout?items=${selection.join(",")}` : "/buyer/checkout");
    });
  }, [cancelledOrderId, router, selection]);

  function set(field: AddressField, value: string) {
    setFields((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    let destination: { name: string; address: string; city: string; phone: string };
    if (choice === "new") {
      const clean = cleanAddress(fields);
      if (!clean.ok) {
        setErrors({ [clean.field]: clean.error });
        document.getElementById(`ck-${clean.field}`)?.focus();
        return;
      }
      destination = { name: clean.value.recipient, address: addressLine(clean.value), city: clean.value.city, phone: clean.value.phone };
      if (save && addresses !== null) {
        const res = await saveAddress({ ...clean.value, makeDefault: saved.length === 0 });
        if (!res.ok) toast(`Your order will still go through, but the address was not saved: ${res.error}`, "warning");
      }
    } else {
      const a = saved.find((x) => x.id === choice);
      if (!a) {
        setFormError("Choose where to deliver.");
        return;
      }
      destination = { name: a.recipient, address: addressLine(a), city: a.city, phone: a.phone };
    }

    setBusy(true);
    const res = await placeOrder({
      shippingName: destination.name,
      shippingAddress: destination.address,
      shippingCity: destination.city,
      shippingPhone: destination.phone,
      paymentMethod: payment,
      // Order exactly the lines priced on this page.
      cartItemIds: cart.lines.map((l) => l.cartItemId).filter((n): n is number => n != null),
    });

    if (!res.ok) {
      // Nothing is cleared: the buyer fixes what is wrong and tries again.
      setBusy(false);
      setFormError(res.error || "Could not place your order. Please try again.");
      return;
    }
    if (res.redirectUrl) {
      // Keep the draft: if the buyer cancels on PayMongo they come back here.
      toast("Taking you to the secure payment page…", "info");
      window.location.href = res.redirectUrl;
      return;
    }
    try {
      window.sessionStorage.removeItem(DRAFT_KEY);
    } catch {}
    setBusy(false);
    toast(`Order ${res.orderId} placed. Thank you!`, "success");
    router.push(`/buyer/orders?placed=${res.orderId}`);
  }

  const field = (name: AddressField, label: string, opts: { hint?: string; autoComplete?: string; inputMode?: "tel" | "numeric"; optional?: boolean } = {}) => (
    <div className="field">
      <label htmlFor={`ck-${name}`}>
        {label}
        {opts.optional ? <span className="muted"> (optional)</span> : null}
      </label>
      <input
        id={`ck-${name}`}
        value={fields[name]}
        onChange={(e) => set(name, e.target.value)}
        autoComplete={opts.autoComplete}
        inputMode={opts.inputMode}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={[opts.hint ? `ck-${name}-hint` : "", errors[name] ? `ck-${name}-err` : ""].filter(Boolean).join(" ") || undefined}
      />
      {opts.hint ? (
        <p id={`ck-${name}-hint`} className="hint">
          {opts.hint}
        </p>
      ) : null}
      {errors[name] ? (
        <p id={`ck-${name}-err`} className="field-error">
          {errors[name]}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="checkout-grid">
      <form id="checkout-form" className="checkout-form" noValidate onSubmit={onSubmit}>
        {cancelNotice ? (
          <p className="notice notice--info" role="status">
            {cancelNotice}
          </p>
        ) : null}
        {selection ? (
          <p className="notice notice--info">
            You are checking out {cart.itemCount} item{cart.itemCount === 1 ? "" : "s"}. Anything else stays in your{" "}
            <Link href="/buyer/cart">cart</Link>.
          </p>
        ) : null}

        <fieldset>
          <legend>Deliver to</legend>
          {saved.length ? (
            <div className="address-choices">
              {saved.map((a) => (
                <label key={a.id} className={`address-choice${choice === a.id ? " is-selected" : ""}`}>
                  <input type="radio" name="address-choice" checked={choice === a.id} onChange={() => setChoice(a.id)} />
                  <span>
                    <strong>
                      {a.label ? `${a.label} · ` : ""}
                      {a.recipient}
                    </strong>
                    {a.isDefault ? <span className="badge">Default</span> : null}
                    <span className="address-choice__line">
                      {addressLine(a)}, {a.city}
                    </span>
                    <span className="muted small">{a.phone}</span>
                  </span>
                </label>
              ))}
              <label className={`address-choice${choice === "new" ? " is-selected" : ""}`}>
                <input type="radio" name="address-choice" checked={choice === "new"} onChange={() => setChoice("new")} />
                <span>
                  <strong>A new address</strong>
                </span>
              </label>
            </div>
          ) : null}

          {choice === "new" ? (
            <div className="address-form">
              {field("recipient", "Full name of the recipient", { autoComplete: "name" })}
              {field("phone", "Contact number", { autoComplete: "tel", inputMode: "tel", hint: "For example 09171234567. The courier calls this number." })}
              {field("line1", "House number and street", { autoComplete: "address-line1" })}
              <div className="row">
                {field("barangay", "Barangay", { optional: true })}
                {field("city", "City or municipality", { autoComplete: "address-level2" })}
              </div>
              <div className="row">
                {field("province", "Province", { autoComplete: "address-level1", optional: true })}
                {field("postalCode", "ZIP code", { autoComplete: "postal-code", inputMode: "numeric", optional: true })}
              </div>
              {addresses !== null ? (
                <div className="field field--check">
                  <input id="ck-save" type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
                  <label htmlFor="ck-save">Save this address for next time</label>
                </div>
              ) : null}
            </div>
          ) : null}
        </fieldset>

        <fieldset>
          <legend>Payment</legend>
          <div className="field">
            <label className="radio">
              <input type="radio" name="payment" value="cod" checked={payment === "cod"} onChange={() => setPayment("cod")} />
              Cash on delivery
            </label>
          </div>
          <div className="field">
            <label className="radio">
              <input
                type="radio"
                name="payment"
                value="paymongo"
                checked={payment === "paymongo"}
                disabled={!onlinePaymentEnabled}
                onChange={() => setPayment("paymongo")}
                aria-describedby="pay-online-hint"
              />
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
        {formError ? (
          <p className="form-error" role="alert">
            {formError}
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
            <p className="checkout-group__ship muted small">Shipping from this shop: {money(g.shippingFee)}</p>
          </section>
        ))}
        <dl className="totals">
          <div>
            <dt>Subtotal</dt>
            <dd className="price">{money(cart.subtotal)}</dd>
          </div>
          <div>
            <dt>
              Shipping ({cart.groups.length} shop{cart.groups.length === 1 ? "" : "s"})
            </dt>
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

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { money, svgPlaceholder } from "@/lib/format";
import { toast } from "@/lib/toast";
import * as cart from "@/lib/cart";
import { placeOrder } from "@/lib/actions/shop";
import type { CartItem } from "@/lib/types";

type ProductLite = { id: number; title: string; image: string | null; images: string[] | null };
type VariantLite = { id: number; color_name: string; size: string | null };

const SHIPPING = 60;

function imgSrc(p?: ProductLite): string {
  if (p?.images && p.images.length) return p.images[0];
  return svgPlaceholder(p?.image);
}

export function CheckoutClient({
  userId,
  userName,
  products,
  variants,
}: {
  userId: number;
  userName: string;
  products: ProductLite[];
  variants: VariantLite[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const list = cart.getItems(userId);
    setItems(list);
    setReady(true);
    if (list.length === 0) router.replace("/buyer/cart");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!ready || items.length === 0) return null;

  const sub = items.reduce((n, it) => n + it.unit_price * it.quantity, 0);
  const total = sub + SHIPPING;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    setBusy(true);
    const res = await placeOrder(items);
    setBusy(false);
    if (!res.ok) {
      toast(res.error || "Could not place order.", "error");
      return;
    }
    cart.clear(userId);
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
          <legend>Payment (demo)</legend>
          <div className="field">
            <label>
              <input type="radio" name="payment" value="cod" defaultChecked /> Cash on delivery
            </label>
          </div>
          <div className="field">
            <label>
              <input type="radio" name="payment" value="ewallet" /> E-wallet (simulated)
            </label>
          </div>
          <p className="hint">No real payment is processed. This is a capstone demo.</p>
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
            <dd>{money(SHIPPING)}</dd>
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

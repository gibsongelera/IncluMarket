"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "./Icon";
import { money, svgPlaceholder } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  removeFromCartAction,
  setCartQuantityAction,
} from "@/lib/actions/cart";
import type { CartItem } from "@/lib/types";

type ProductLite = {
  id: number;
  title: string;
  seller_id: number;
  image: string | null;
  images: string[] | null;
};
type VariantLite = {
  id: number;
  color_name: string;
  size: string | null;
  stock_qty: number;
  sku_code: string;
};
type SellerLite = { id: number; name: string };

function imgSrc(p?: ProductLite): string {
  if (p?.images && p.images.length) return p.images[0];
  return svgPlaceholder(p?.image);
}

export function CartClient({
  items: initialItems,
  products,
  variants,
  sellers,
}: {
  items: CartItem[];
  products: ProductLite[];
  variants: VariantLite[];
  sellers: SellerLite[];
}) {
  const router = useRouter();
  const items = initialItems;

  const productById = (id: number) => products.find((p) => p.id === id);
  const variantById = (id: number) => variants.find((v) => v.id === id);
  const sellerById = (id: number) => sellers.find((s) => s.id === id);

  async function changeQty(it: CartItem, quantity: number, stockCap: number) {
    const res = await setCartQuantityAction(it.product_id, it.variant_id || null, quantity, stockCap);
    if (!res.ok) {
      toast(res.error || "Could not update quantity.", "error");
      return;
    }
    router.refresh();
  }

  async function remove(it: CartItem) {
    const res = await removeFromCartAction(it.product_id, it.variant_id || null);
    if (!res.ok) {
      toast(res.error || "Could not remove item.", "error");
      return;
    }
    toast("Item removed.", "success");
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <p className="empty" id="cart-empty">
        Your cart is empty. <Link href="/home">Start shopping.</Link>
      </p>
    );
  }

  const groups: Record<
    string,
    { seller: SellerLite | undefined; rows: { it: CartItem; p: ProductLite | undefined }[] }
  > = {};
  let subtotal = 0;
  items.forEach((it) => {
    const p = productById(it.product_id);
    const sid = p ? p.seller_id : 0;
    if (!groups[sid]) groups[sid] = { seller: sellerById(sid), rows: [] };
    groups[sid].rows.push({ it, p });
    subtotal += it.unit_price * it.quantity;
  });

  return (
    <>
      <div id="cart-body">
        {Object.keys(groups).map((sid) => {
          const g = groups[sid];
          const groupTotal = g.rows.reduce((n, r) => n + r.it.unit_price * r.it.quantity, 0);
          return (
            <section
              className="cart-group"
              key={sid}
              aria-label={`Items from ${g.seller ? g.seller.name : "Seller"}`}
            >
              <header className="cart-group__head">
                <span>
                  <Icon name="box" size={18} />
                </span>
                <strong>{g.seller ? g.seller.name : "PWD Seller"}</strong>
                <span className="badge">
                  {g.rows.length} item{g.rows.length > 1 ? "s" : ""}
                </span>
              </header>
              <div className="cart-group__body">
                {g.rows.map((r) => {
                  const it = r.it;
                  const p = r.p;
                  const v = variantById(it.variant_id);
                  const stockCap = v ? v.stock_qty : it.quantity;
                  return (
                    <div className="cart-item" key={`${it.product_id}-${it.variant_id}`}>
                      <div className="cart-item__thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imgSrc(p)} alt="" />
                      </div>
                      <div>
                        <div className="cart-item__title">{p ? p.title : "Item"}</div>
                        <div className="cart-item__meta">
                          {v ? `${v.color_name} · ${v.size} · SKU ${v.sku_code}` : ""}
                        </div>
                      </div>
                      <div className="cart-item__price">{money(it.unit_price)}</div>
                      <div className="qty-ctrl">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          onClick={() => changeQty(it, it.quantity - 1, stockCap)}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={stockCap}
                          value={it.quantity}
                          aria-label="Quantity"
                          onChange={(e) =>
                            changeQty(it, Number(e.target.value), stockCap)
                          }
                        />
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          onClick={() => changeQty(it, it.quantity + 1, stockCap)}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        aria-label="Remove item"
                        onClick={() => remove(it)}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
              <footer className="cart-group__foot">
                Subtotal for this shop: <strong>{money(groupTotal)}</strong>
              </footer>
            </section>
          );
        })}

        <div className="cart-summary--sticky">
          <span className="muted">
            {items.length} item{items.length > 1 ? "s" : ""} in cart
          </span>
          <span className="total">Total: {money(subtotal)}</span>
          <Link href="/buyer/checkout" className="btn btn--danger">
            Checkout &rarr;
          </Link>
        </div>
      </div>
    </>
  );
}

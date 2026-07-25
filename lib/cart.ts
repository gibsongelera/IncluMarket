"use client";

// Buyer-scoped cart in localStorage, ported from assets/js/cart.js.
// Cart items: { product_id, variant_id, quantity, unit_price, added_at }.
import type { CartItem } from "./types";

const CART_KEY = "inklumarket_cart_v1";

type CartMap = Record<string, CartItem[]>;

function readMap(): CartMap {
  if (typeof window === "undefined") return {};
  try {
    return (JSON.parse(localStorage.getItem(CART_KEY) || "{}") as CartMap) || {};
  } catch {
    return {};
  }
}

function writeMap(map: CartMap) {
  localStorage.setItem(CART_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent("im:cart"));
}

export function getItems(userId: number): CartItem[] {
  return readMap()[String(userId)] || [];
}

export function setItems(userId: number, items: CartItem[]) {
  const map = readMap();
  map[String(userId)] = items;
  writeMap(map);
}

export function count(userId: number): number {
  return getItems(userId).reduce((n, it) => n + Number(it.quantity || 0), 0);
}

export function subtotal(userId: number): number {
  return getItems(userId).reduce(
    (n, it) => n + Number(it.unit_price || 0) * Number(it.quantity || 0),
    0
  );
}

export function addItem(
  userId: number,
  productId: number,
  variantId: number,
  quantity: number,
  unitPrice: number,
  stockCap = Infinity
) {
  const qty = Math.max(1, Number(quantity) || 1);
  const items = getItems(userId);
  const idx = items.findIndex(
    (it) => it.product_id === productId && it.variant_id === variantId
  );
  if (idx >= 0) {
    items[idx].quantity = Math.min(items[idx].quantity + qty, stockCap);
  } else {
    items.push({
      product_id: productId,
      variant_id: variantId,
      quantity: Math.min(qty, stockCap),
      unit_price: Number(unitPrice) || 0,
      added_at: new Date().toISOString(),
    });
  }
  setItems(userId, items);
}

export function setQuantity(
  userId: number,
  productId: number,
  variantId: number,
  quantity: number,
  stockCap = Infinity
) {
  const items = getItems(userId);
  const idx = items.findIndex(
    (it) => it.product_id === productId && it.variant_id === variantId
  );
  if (idx < 0) return;
  items[idx].quantity = Math.max(1, Math.min(stockCap, Number(quantity) || 1));
  setItems(userId, items);
}

export function removeItem(userId: number, productId: number, variantId: number) {
  setItems(
    userId,
    getItems(userId).filter(
      (it) => !(it.product_id === productId && it.variant_id === variantId)
    )
  );
}

export function clear(userId: number) {
  setItems(userId, []);
}

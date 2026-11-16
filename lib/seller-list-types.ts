/**
 * The Seller Centre lists' tabs and row shapes (P3-05, P3-06), apart from
 * their readers. lib/seller-lists.ts is server-only; the list components in
 * components/ take their row types and tab lists from here instead. Plain
 * data and types only: nothing here reads the database, and the imports
 * are type-only, so tests import this file by its .ts path.
 */

import type { Order, OrderStatusHistoryEntry } from "@/lib/types";

// ---------------------------------------------------------------------------
// Orders (P3-05)
// ---------------------------------------------------------------------------

/**
 * The status tabs, in the order an order moves. Each value is the
 * order_status it lists, and the ?status= the dashboard's to-do tiles and
 * donut link with ("?status=pending", "?status=returned").
 */
export const SELLER_ORDER_TABS = [
  { value: "all", label: "All" },
  { value: "pending", label: "New" },
  { value: "processing", label: "To ship" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "return_requested", label: "Returns" },
  { value: "returned", label: "Returned" },
  { value: "cancelled", label: "Cancelled" },
] as const;
export type SellerOrderTab = (typeof SELLER_ORDER_TABS)[number]["value"];

/** ?status=; a value with no tab (or none) shows All. */
export function sellerOrderTab(raw: string | undefined): SellerOrderTab {
  return SELLER_ORDER_TABS.find((t) => t.value === raw)?.value ?? "all";
}

/** What each tab says when it has no orders (no search). */
export const SELLER_ORDER_EMPTY: Record<SellerOrderTab, string> = {
  all: "No orders yet. They show here when a buyer orders from your shop.",
  pending: "No new orders. Orders waiting for you to accept show here.",
  processing: "No orders to ship. New paid orders show here.",
  shipped: "No orders on the way. Orders you ship show here until they arrive.",
  delivered: "No delivered orders yet.",
  return_requested: "No return requests. When a buyer asks to return an order, it shows here.",
  returned: "No returned orders.",
  cancelled: "No cancelled orders.",
};

/** The statuses whose orders still have a parcel to pack: the packing slip is offered for these. */
export const SLIP_STATUSES: readonly string[] = ["pending", "processing", "shipped"];

/** An empty list's sentence, and a link out of it when there is one. */
export interface SellerOrdersEmpty {
  text: string;
  href?: string;
  action?: string;
}

/** One of this seller's lines on an order, as the list shows it. */
export interface SellerOrderLine {
  id: number;
  title: string;
  quantity: number;
  /** The option's colour and size ("Blue / M"); null when the line has none. */
  option: string | null;
}

/**
 * One order as THIS seller may see it: their own lines and those lines'
 * subtotal (never the whole order total, which before 0015 could include
 * other sellers' items), the buyer's short name, and the city the parcel
 * goes to (the packing slip reads the full address). No buyer email.
 */
export type SellerOrderRow = Pick<
  Order,
  "id" | "created_at" | "order_status" | "payment_status" | "payment_provider" | "shipping_city"
> & {
  courier: string | null;
  tracking_number: string | null;
  delivered_at: string | null;
  return_reason: string | null;
  cancel_reason: string | null;
  /** "Maria S.": enough to recognise, not enough to look up. */
  buyerName: string;
  /** This seller's lines on the order. */
  items: SellerOrderLine[];
  /** The sum of this seller's lines. */
  subtotal: number;
  /** A PWD discount on this seller's lines: check the ID on delivery (C-26). */
  pwdCheck: { amount: number; last4: string | null } | null;
  /** The order's status changes, oldest first. */
  history: OrderStatusHistoryEntry[];
};

export interface SellerOrderList {
  rows: SellerOrderRow[];
  /** This seller's orders in the current tab with the search applied. */
  total: number;
  /** The page shown: the one asked for, clamped to the last, or the one holding ?focus=. */
  page: number;
  /** Each tab's count with the search applied; null when it could not be counted (degraded). */
  counts: Record<SellerOrderTab, number | null>;
  /** ?focus= named an order that is not in this tab and search (or not this seller's). */
  focusMissing: boolean;
  /**
   * This database lacks im_orders.seller_id (migration 0015): the list is
   * empty rather than guessing which orders are this seller's, and the page
   * says which update it needs.
   */
  degraded: boolean;
}

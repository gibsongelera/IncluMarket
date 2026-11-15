/**
 * The admin lists' tabs and row shapes (P2-07 to P2-10), apart from their
 * readers. lib/admin-lists.ts is server-only and only app/admin/ may import
 * it (scripts/check-page-props.mjs rule 3); the list components in
 * components/ take their row types and tab lists from here instead. Plain
 * data and types only: nothing here reads the database.
 */

// ---------------------------------------------------------------------------
// Orders (P2-07)
// ---------------------------------------------------------------------------

export const ORDER_VIEWS = [
  { value: "all", label: "Recent" },
  { value: "open", label: "In progress" },
  { value: "returns", label: "Returns" },
  { value: "refunds", label: "Refunds due" },
  { value: "cancelled", label: "Cancelled" },
] as const;
export type OrderView = (typeof ORDER_VIEWS)[number]["value"];

export function orderView(raw: string | undefined): OrderView {
  return ORDER_VIEWS.find((v) => v.value === raw)?.value ?? "all";
}

export interface AdminOrderRow {
  id: number;
  createdAt: string;
  buyerName: string;
  /** The shop's name; null for an order from before one-order-per-seller (0015). */
  sellerName: string | null;
  total: number;
  paymentProvider: string | null;
  paymentStatus: string;
  status: string;
  refundDue: boolean;
  returnReason: string | null;
  cancelReason: string | null;
}

export interface AdminOrderList {
  rows: AdminOrderRow[];
  /** Rows in the current view with the search applied. */
  total: number;
  /** The page shown: the one asked for, clamped to the last, or the one holding ?focus=. */
  page: number;
  /** Each tab's count with the search applied; null when it needs a migration this database lacks. */
  counts: Record<OrderView, number | null>;
  /** A name search matched more people than are searched; the page says to narrow it. */
  capped: boolean;
  /** ?focus= named an order that is not in this view and search. */
  focusMissing: boolean;
  /** A migration this database lacks hides a column or a view (0014 refunds and reasons, 0015 shops). */
  degraded: boolean;
}

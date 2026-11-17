/**
 * The order state machine, as the UI needs it.
 *
 * The database is the authority: migration 0014 enforces every transition in
 * im_transition_order() and a trigger refuses anything else. This mirror lets
 * screens offer only the buttons that can succeed, and maps an order to the
 * Shopee-style buyer tabs. Pure — tested by tests/order-state.test.mjs.
 */

export type OrderState =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "return_requested"
  | "returned";

export type Actor = "buyer" | "seller" | "admin" | "system";

/** Every allowed move, and who may make it. Must match 0014. */
export const TRANSITIONS: Record<OrderState, Partial<Record<OrderState, Actor[]>>> = {
  pending: { processing: ["seller", "admin", "system"], cancelled: ["buyer", "seller", "admin", "system"] },
  processing: { shipped: ["seller", "admin"], cancelled: ["seller", "admin"] },
  shipped: { delivered: ["buyer", "seller", "admin"] },
  delivered: { return_requested: ["buyer", "admin"] },
  return_requested: { returned: ["seller", "admin"], delivered: ["seller", "admin"] },
  cancelled: {},
  returned: {},
};

export interface OrderFacts {
  order_status: string;
  payment_provider: string | null;
  payment_status: string;
  delivered_at?: string | null;
}

export function canTransition(
  order: OrderFacts,
  to: OrderState,
  actor: Actor,
  now: number = Date.now(),
  returnWindowDays = 7
): boolean {
  const from = order.order_status as OrderState;
  const who = TRANSITIONS[from]?.[to];
  if (!who || !who.includes(actor)) return false;
  if (to === "processing" && order.payment_provider === "paymongo" && order.payment_status !== "paid") return false;
  // A seller cannot cancel an online order while its payment may still arrive.
  if (to === "cancelled" && actor === "seller" && order.payment_provider === "paymongo" && order.payment_status === "pending")
    return false;
  if (to === "return_requested" && actor === "buyer") {
    if (!order.delivered_at) return false;
    const deliveredMs = new Date(order.delivered_at).getTime();
    if (now - deliveredMs > returnWindowDays * 86_400_000) return false;
  }
  return true;
}

/** The moves `actor` can make on this order right now. */
export function nextStates(order: OrderFacts, actor: Actor, now: number = Date.now(), returnWindowDays = 7): OrderState[] {
  const from = order.order_status as OrderState;
  return (Object.keys(TRANSITIONS[from] ?? {}) as OrderState[]).filter((to) =>
    canTransition(order, to, actor, now, returnWindowDays)
  );
}

// ---------------------------------------------------------------------------
// Buyer tabs (Shopee-style)
// ---------------------------------------------------------------------------

export type BuyerTab = "to_pay" | "to_ship" | "to_receive" | "completed" | "cancelled" | "returns";

export const BUYER_TABS: { value: BuyerTab; label: string }[] = [
  { value: "to_pay", label: "To pay" },
  { value: "to_ship", label: "To ship" },
  { value: "to_receive", label: "To receive" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "returns", label: "Return / refund" },
];

export function buyerTab(order: OrderFacts): BuyerTab {
  switch (order.order_status) {
    case "pending":
      return order.payment_provider === "paymongo" && order.payment_status !== "paid" ? "to_pay" : "to_ship";
    case "processing":
      return "to_ship";
    case "shipped":
      return "to_receive";
    case "delivered":
      return "completed";
    case "cancelled":
      return "cancelled";
    default:
      return "returns";
  }
}

/** The four "My purchases" tiles of the buyer dashboard (05 §3). */
export type PurchaseTab = "to_pay" | "to_ship" | "to_receive" | "returns";
export type PurchaseCounts = Record<PurchaseTab, number>;

/**
 * How many of these orders sit in each "My purchases" tile, by buyerTab():
 * the same rule /buyer/orders counts its tabs with (OrdersClient), so the
 * dashboard's figures are the tab labels' figures. Completed and cancelled
 * orders have no tile and are not counted.
 */
export function countBuyerTabs(orders: readonly OrderFacts[]): PurchaseCounts {
  const counts: PurchaseCounts = { to_pay: 0, to_ship: 0, to_receive: 0, returns: 0 };
  for (const o of orders) {
    const tab = buyerTab(o);
    if (tab in counts) counts[tab as PurchaseTab]++;
  }
  return counts;
}

/** Plain-language status for buyers. */
export function buyerStatusText(order: OrderFacts): string {
  switch (order.order_status) {
    case "pending":
      if (order.payment_provider === "paymongo") {
        return order.payment_status === "failed" ? "Payment not completed" : "Waiting for payment";
      }
      return "Waiting for the seller to confirm";
    case "processing":
      return "Seller is preparing your order";
    case "shipped":
      return "On the way";
    case "delivered":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
    case "return_requested":
      return "Return requested";
    case "returned":
      return "Returned";
    default:
      return order.order_status;
  }
}

/** Plain message for each code im_transition_order() can return. */
export function transitionMessage(code: string, to?: string): string {
  switch (code) {
    case "ok":
      return "Done.";
    case "not_found":
      return "We could not find that order.";
    case "illegal":
      return to ? `This order cannot be moved to "${to.replace(/_/g, " ")}" from where it is now.` : "That step is not possible for this order.";
    case "forbidden":
      return "You are not allowed to make that change to this order.";
    case "not_paid":
      return "Wait until the buyer's online payment is complete before preparing this order.";
    case "return_window_closed":
      return "The return window for this order has closed. Please contact support if something is wrong.";
    case "reason_required":
      return "Please tell us the reason.";
    default:
      return "That did not work. Please try again.";
  }
}

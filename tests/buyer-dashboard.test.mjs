import { test } from "node:test";
import assert from "node:assert/strict";
import { buyerTab, countBuyerTabs } from "../lib/orders/state.ts";

// The buyer dashboard's "My purchases" tiles (P4-06, 05 §3): the counts
// /buyer/orders shows on its tabs, by the same buyerTab() rule.

const cod = (status, extra = {}) => ({ order_status: status, payment_provider: "cod", payment_status: "unpaid", ...extra });
const online = (status, pay, extra = {}) => ({ order_status: status, payment_provider: "paymongo", payment_status: pay, ...extra });
const none = { to_pay: 0, to_ship: 0, to_receive: 0, returns: 0 };

test("no orders: every tile is 0", () => {
  assert.deepEqual(countBuyerTabs([]), none);
});

test("an unpaid online order is to pay", () => {
  assert.deepEqual(countBuyerTabs([online("pending", "pending")]), { ...none, to_pay: 1 });
  // A failed payment can still be retried from My orders: still to pay.
  assert.deepEqual(countBuyerTabs([online("pending", "failed")]), { ...none, to_pay: 1 });
});

test("a pending cash-on-delivery order is to ship, not to pay", () => {
  assert.deepEqual(countBuyerTabs([cod("pending")]), { ...none, to_ship: 1 });
  // A paid online order waiting for the seller is to ship as well.
  assert.deepEqual(countBuyerTabs([online("pending", "paid")]), { ...none, to_ship: 1 });
});

test("processing is to ship; shipped is to receive", () => {
  assert.deepEqual(countBuyerTabs([cod("processing"), online("processing", "paid")]), { ...none, to_ship: 2 });
  assert.deepEqual(countBuyerTabs([cod("shipped")]), { ...none, to_receive: 1 });
});

test("return requested and returned are return / refund", () => {
  assert.deepEqual(countBuyerTabs([cod("return_requested"), cod("returned")]), { ...none, returns: 2 });
});

test("delivered and cancelled orders have no tile", () => {
  assert.deepEqual(countBuyerTabs([cod("delivered"), cod("cancelled"), online("cancelled", "expired")]), none);
});

test("each order is counted once, in the tab /buyer/orders puts it in", () => {
  const orders = [
    online("pending", "pending"),
    cod("pending"),
    cod("processing"),
    cod("shipped"),
    cod("shipped"),
    cod("delivered"),
    cod("cancelled"),
    cod("return_requested"),
  ];
  const counts = countBuyerTabs(orders);
  assert.deepEqual(counts, { to_pay: 1, to_ship: 2, to_receive: 2, returns: 1 });
  // The OrdersClient count, tab by tab, agrees.
  for (const tab of Object.keys(counts)) {
    assert.equal(orders.filter((o) => buyerTab(o) === tab).length, counts[tab], tab);
  }
});

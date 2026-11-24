import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buyerStatusText,
  buyerTab,
  canTransition,
  isPrepaid,
  nextStates,
  paymentMethodLabel,
  paymentShortLabel,
  transitionMessage,
} from "../lib/orders/state.ts";

const cod = (status, extra = {}) => ({ order_status: status, payment_provider: "cod", payment_status: "unpaid", ...extra });
const online = (status, pay, extra = {}) => ({ order_status: status, payment_provider: "paymongo", payment_status: pay, ...extra });

test("steps can only go forward one at a time (B-10)", () => {
  assert.equal(canTransition(cod("pending"), "delivered", "seller"), false);
  assert.equal(canTransition(cod("delivered"), "pending", "seller"), false);
  assert.equal(canTransition(cod("pending"), "processing", "seller"), true);
  assert.equal(canTransition(cod("processing"), "shipped", "seller"), true);
  assert.equal(canTransition(cod("shipped"), "delivered", "seller"), true);
});

test("a seller cannot mark returned on their own", () => {
  assert.equal(canTransition(cod("delivered"), "returned", "seller"), false);
  assert.equal(canTransition(cod("return_requested"), "returned", "seller"), true);
});

test("an unpaid online order cannot be prepared", () => {
  assert.equal(canTransition(online("pending", "pending"), "processing", "seller"), false);
  assert.equal(canTransition(online("pending", "paid"), "processing", "seller"), true);
});

test("buyers: cancel before shipping, confirm receipt, return within the window", () => {
  assert.equal(canTransition(cod("pending"), "cancelled", "buyer"), true);
  assert.equal(canTransition(cod("processing"), "cancelled", "buyer"), false);
  assert.equal(canTransition(cod("shipped"), "delivered", "buyer"), true);
  const now = Date.parse("2026-10-20T00:00:00Z");
  const recent = cod("delivered", { delivered_at: "2026-10-15T00:00:00Z" });
  const old = cod("delivered", { delivered_at: "2026-10-01T00:00:00Z" });
  assert.equal(canTransition(recent, "return_requested", "buyer", now, 7), true);
  assert.equal(canTransition(old, "return_requested", "buyer", now, 7), false);
});

test("terminal states have no next step", () => {
  assert.deepEqual(nextStates(cod("cancelled"), "admin"), []);
  assert.deepEqual(nextStates(cod("returned"), "admin"), []);
});

test("buyer tabs", () => {
  assert.equal(buyerTab(online("pending", "pending")), "to_pay");
  assert.equal(buyerTab(online("pending", "failed")), "to_pay");
  assert.equal(buyerTab(cod("pending")), "to_ship");
  assert.equal(buyerTab(online("processing", "paid")), "to_ship");
  assert.equal(buyerTab(cod("shipped")), "to_receive");
  assert.equal(buyerTab(cod("delivered")), "completed");
  assert.equal(buyerTab(cod("cancelled")), "cancelled");
  assert.equal(buyerTab(cod("return_requested")), "returns");
  assert.equal(buyerTab(cod("returned")), "returns");
});

test("every database code has a message", () => {
  for (const c of ["ok", "not_found", "illegal", "forbidden", "not_paid", "return_window_closed", "reason_required"]) {
    assert.ok(transitionMessage(c).length > 3, c);
  }
});

const counter = (status, pay, extra = {}) => ({ order_status: status, payment_provider: "otc", payment_status: pay, ...extra });

test("an order paid to the Workshop (0028) waits for the payment like an online one", () => {
  assert.equal(isPrepaid("otc"), true);
  assert.equal(isPrepaid("paymongo"), true);
  assert.equal(isPrepaid("cod"), false);
  assert.equal(isPrepaid(null), false);
  assert.equal(canTransition(counter("pending", "pending"), "processing", "seller"), false);
  assert.equal(canTransition(counter("pending", "paid"), "processing", "seller"), true);
  // The buyer may still be paying: only the buyer, an admin or the hold cancels it.
  assert.equal(canTransition(counter("pending", "pending"), "cancelled", "seller"), false);
  assert.equal(canTransition(counter("pending", "pending"), "cancelled", "buyer"), true);
  assert.equal(buyerTab(counter("pending", "pending")), "to_pay");
  assert.equal(buyerTab(counter("pending", "paid")), "to_ship");
  assert.equal(buyerStatusText(counter("pending", "pending")), "Waiting for payment");
});

test("each way of paying has its words", () => {
  assert.equal(paymentMethodLabel("otc"), "Paid to the Workshop (GCash, Maribank, LBP)");
  assert.equal(paymentMethodLabel("paymongo"), "Online (GCash, Maya, card)");
  assert.equal(paymentMethodLabel("cod"), "Cash on delivery");
  assert.equal(paymentShortLabel("otc"), "Paid to the Workshop");
  assert.equal(paymentShortLabel(null), "Cash on delivery");
  assert.match(transitionMessage("not_paid"), /payment is confirmed/);
});

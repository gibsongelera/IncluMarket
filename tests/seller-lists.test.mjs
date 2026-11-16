// lib/seller-list-types.ts (P3-05): Seller Centre → Orders' status tabs,
// their ?status= parser and empty states, and the search rule the reader
// (lib/seller-lists.ts) applies with lib/list-params.ts: an order number
// ("12" or "#12") searches order numbers; anything else is a buyer's name.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SELLER_ORDER_EMPTY,
  SELLER_ORDER_TABS,
  SLIP_STATUSES,
  sellerOrderTab,
} from "../lib/seller-list-types.ts";
import { TRANSITIONS } from "../lib/orders/state.ts";
import { searchId, searchPattern } from "../lib/list-params.ts";

test("the tabs, in the order an order moves, with Returned (P3-05)", () => {
  assert.deepEqual(
    SELLER_ORDER_TABS.map((t) => t.label),
    ["All", "New", "To ship", "Shipped", "Delivered", "Returns", "Returned", "Cancelled"]
  );
  const values = SELLER_ORDER_TABS.map((t) => t.value);
  assert.equal(new Set(values).size, values.length, "tab values are unique");
});

test("every tab but All is an order status the state machine knows", () => {
  const states = new Set(Object.keys(TRANSITIONS));
  for (const t of SELLER_ORDER_TABS) {
    if (t.value === "all") continue;
    assert.ok(states.has(t.value), `${t.value} is an order status`);
  }
  // Every status has a tab, so no order is reachable from All alone.
  for (const s of states) assert.ok(SELLER_ORDER_TABS.some((t) => t.value === s), `${s} has a tab`);
});

test("?status=: each tab's value opens it; the dashboard's links keep working", () => {
  for (const t of SELLER_ORDER_TABS) assert.equal(sellerOrderTab(t.value), t.value);
  // The to-do tiles and the donut link with these.
  assert.equal(sellerOrderTab("pending"), "pending");
  assert.equal(sellerOrderTab("processing"), "processing");
  assert.equal(sellerOrderTab("return_requested"), "return_requested");
  assert.equal(sellerOrderTab("returned"), "returned");
});

test("?status=: an unknown, missing or differently written value shows All", () => {
  for (const raw of [undefined, "", "bogus", "PENDING", " pending", "archived", "toString", "__proto__", "returns"]) {
    assert.equal(sellerOrderTab(raw), "all", String(raw));
  }
});

test("every tab has its own empty-state sentence", () => {
  for (const t of SELLER_ORDER_TABS) {
    const text = SELLER_ORDER_EMPTY[t.value];
    assert.equal(typeof text, "string", t.value);
    assert.ok(text.length > 10 && text.endsWith("."), `${t.value}: a sentence`);
  }
  assert.equal(SELLER_ORDER_EMPTY.processing, "No orders to ship. New paid orders show here.");
  assert.equal(new Set(Object.values(SELLER_ORDER_EMPTY)).size, SELLER_ORDER_TABS.length, "no two tabs say the same");
});

test("the packing slip is offered while there is a parcel to pack", () => {
  assert.deepEqual([...SLIP_STATUSES], ["pending", "processing", "shipped"]);
});

test("search: an order number, with or without #, is an order number", () => {
  assert.equal(searchId("12"), 12);
  assert.equal(searchId("#12"), 12);
  assert.equal(searchId("  #12 "), 12);
  // Not order numbers: these search buyers' names instead.
  for (const q of ["12 maria", "1e3", "-2", "3.5", "0x10", "#", "0", "##12", "maria"]) {
    assert.equal(searchId(q), null, q);
  }
});

test("search: a name becomes an escaped ilike pattern, never PostgREST grammar", () => {
  assert.equal(searchPattern("Maria"), "%Maria%");
  assert.equal(searchPattern("50%_off"), "%50\\%\\_off%");
  for (const q of ["a,buyer_id.eq.1", "x),seller_id.neq.(0", 'm"*', "a*b"]) {
    const p = searchPattern(q);
    assert.ok(p === null || !/[,()"*]/.test(p), `${q} → ${p}`);
  }
  assert.equal(searchPattern(",()*\""), null, "only grammar characters: nothing to search");
});

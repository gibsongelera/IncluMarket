// lib/seller-list-types.ts (P3-05, P3-06): Seller Centre → Orders' status tabs,
// their ?status= parser and empty states, and the search rule the reader
// (lib/seller-lists.ts) applies with lib/list-params.ts: an order number
// ("12" or "#12") searches order numbers; anything else is a buyer's name.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SELLER_ORDER_EMPTY,
  SELLER_ORDER_TABS,
  SELLER_PRODUCT_EMPTY,
  SELLER_PRODUCT_TABS,
  SLIP_STATUSES,
  photoWords,
  productStatusWords,
  sellerOrderTab,
  sellerProductTab,
  stockWords,
} from "../lib/seller-list-types.ts";
import { LOW_STOCK_MAX } from "../lib/analytics/seller.ts";
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

// ---------------------------------------------------------------------------
// Products (P3-06): the tabs in the seller's words, their ?status= parser
// and empty states, the pill's words, and the stock and photo words.
// ---------------------------------------------------------------------------

test("products: the tabs, in the seller's words (04 §5)", () => {
  assert.deepEqual(
    SELLER_PRODUCT_TABS.map((t) => [t.value, t.label]),
    [
      ["all", "All"],
      ["approved", "On sale"],
      ["pending", "In review"],
      ["flagged", "Needs changes"],
      ["archived", "Unpublished"],
    ]
  );
});

test("products: every status a product can have has a tab", () => {
  // lib/types.ts ProductStatus, and 0016's check constraint.
  for (const s of ["pending", "approved", "flagged", "archived"]) {
    assert.ok(SELLER_PRODUCT_TABS.some((t) => t.value === s), `${s} has a tab`);
  }
});

test("products ?status=: the raw status opens its tab; the dashboard's ?status=flagged keeps working", () => {
  for (const t of SELLER_PRODUCT_TABS) assert.equal(sellerProductTab(t.value), t.value);
  assert.equal(sellerProductTab("flagged"), "flagged");
  assert.equal(sellerProductTab("archived"), "archived");
});

test("products ?status=: an unknown, missing or differently written value shows All", () => {
  for (const raw of [undefined, "", "bogus", "APPROVED", " flagged", "on sale", "On sale", "Needs changes", "toString", "__proto__", "processing"]) {
    assert.equal(sellerProductTab(raw), "all", String(raw));
  }
});

test("products: each tab has its own empty-state sentence", () => {
  for (const t of SELLER_PRODUCT_TABS) {
    const text = SELLER_PRODUCT_EMPTY[t.value];
    assert.equal(typeof text, "string", t.value);
    assert.ok(text.length > 10 && text.endsWith("."), `${t.value}: a sentence`);
  }
  assert.equal(SELLER_PRODUCT_EMPTY.all, "You have no products yet.");
  assert.equal(SELLER_PRODUCT_EMPTY.flagged, "Nothing needs changes. Listings an admin sends back show here.");
  assert.equal(new Set(Object.values(SELLER_PRODUCT_EMPTY)).size, SELLER_PRODUCT_TABS.length, "no two tabs say the same");
});

test("products: a pill says its status as its tab does", () => {
  assert.equal(productStatusWords("approved"), "On sale");
  assert.equal(productStatusWords("pending"), "In review");
  assert.equal(productStatusWords("flagged"), "Needs changes");
  assert.equal(productStatusWords("archived"), "Unpublished");
  // Not a status: "all" is a tab, never a product's status.
  assert.equal(productStatusWords("all"), "all");
  assert.equal(productStatusWords(undefined), "");
});

test("products: stock in words, and Running low as the dashboard counts it (1 to LOW_STOCK_MAX)", () => {
  assert.equal(LOW_STOCK_MAX, 5);
  assert.deepEqual(stockWords([10, 8, 6], LOW_STOCK_MAX), { text: "3 options · 24 in stock", low: false });
  assert.deepEqual(stockWords([12], LOW_STOCK_MAX), { text: "1 option · 12 in stock", low: false });
  assert.deepEqual(stockWords([], LOW_STOCK_MAX), { text: "No options yet", low: false });
  assert.equal(stockWords([20, 5], LOW_STOCK_MAX).low, true, "5 left is running low");
  assert.equal(stockWords([20, 1], LOW_STOCK_MAX).low, true, "1 left is running low");
  assert.equal(stockWords([20, 6], LOW_STOCK_MAX).low, false, "6 left is fine");
  assert.equal(stockWords([20, 0], LOW_STOCK_MAX).low, false, "0 is sold out, not running low");
  assert.equal(stockWords([1000, 250], LOW_STOCK_MAX).text, "2 options · 1,250 in stock");
  // Bad numbers count as none, never as negative stock.
  assert.equal(stockWords([-3, Number.NaN, 2], LOW_STOCK_MAX).text, "3 options · 2 in stock");
});

test("products: photos in words", () => {
  assert.equal(photoWords(0), "No photos");
  assert.equal(photoWords(1), "1 photo");
  assert.equal(photoWords(3), "3 photos");
});

test("products search: a listing number, with or without #, is also searched as title text", () => {
  // The reader matches .in("id", [n, …titles containing n]) for these.
  assert.equal(searchId("#12"), 12);
  assert.equal(searchPattern(String(searchId("#12"))), "%12%");
  // Words go to the title as an escaped ilike pattern.
  assert.equal(searchId("bayong bag"), null);
  assert.equal(searchPattern("bayong bag"), "%bayong bag%");
});

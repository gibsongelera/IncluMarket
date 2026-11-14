// lib/analytics (03 §4, as the approved plan corrected it): Manila days and
// windows, and the dashboard figures from plain rows. Both modules are pure,
// so they are imported by their .ts path (see tests/format.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayRanges, inRange, manilaDayKey, manilaDayStart, weekBlocks, windows } from "../lib/analytics/windows.ts";
import {
  ORDER_STATUSES,
  byCategory,
  daily,
  lineTotals,
  statusSplit,
  topProducts,
  totals,
} from "../lib/analytics/aggregate.ts";

/** 1:00 pm on 10 November 2026 in Manila. */
const NOW = Date.parse("2026-11-10T05:00:00Z");
const { current, previous } = windows(NOW);
const order = (id, created_at, order_status, subtotal, extra = {}) => ({
  id,
  created_at,
  order_status,
  subtotal,
  seller_id: 1,
  ...extra,
});

test("Manila days: midnight is 16:00 UTC the day before, all year", () => {
  assert.equal(manilaDayKey("2026-11-09T16:00:00Z"), "2026-11-10");
  assert.equal(manilaDayKey("2026-11-09T15:59:59.999Z"), "2026-11-09");
  assert.equal(manilaDayStart(NOW), Date.parse("2026-11-09T16:00:00Z"));
  assert.equal(manilaDayKey("2026-06-30T16:00:00Z"), "2026-07-01"); // no daylight saving
  assert.equal(manilaDayKey("not a date"), "");
});

test("windows: the 30 Manila days ending with today and the 30 before meet exactly", () => {
  assert.equal(new Date(current.start).toISOString(), "2026-10-11T16:00:00.000Z");
  assert.equal(new Date(current.end).toISOString(), "2026-11-10T16:00:00.000Z");
  assert.equal(previous.end, current.start);
  assert.equal(new Date(previous.start).toISOString(), "2026-09-11T16:00:00.000Z");
  const days = dayRanges(current);
  assert.equal(days.length, 30);
  assert.equal(days[0].day, "2026-10-12");
  assert.equal(days[29].day, "2026-11-10");
  assert.ok(inRange("2026-10-11T16:00:00Z", current)); // the window's first instant
  assert.ok(!inRange("2026-10-11T15:59:59.999Z", current));
  assert.ok(inRange("2026-10-11T15:59:59.999Z", previous)); // the previous window's last
  assert.ok(!inRange("2026-09-11T15:59:59.999Z", previous));
  assert.ok(!inRange(null, current));
});

test("weekBlocks: seven Manila days each, oldest first, the last ending with today", () => {
  const w = weekBlocks(NOW, 12);
  assert.equal(w.length, 12);
  assert.deepEqual([w[11].firstDay, w[11].lastDay], ["2026-11-04", "2026-11-10"]);
  assert.equal(w[10].lastDay, "2026-11-03");
  assert.equal(w[0].firstDay, "2026-08-19");
  for (let i = 1; i < w.length; i++) assert.equal(w[i].start, w[i - 1].end);
  assert.equal(w[11].end, current.end);
});

test("empty input: zeros, no average or rate, 30 zero days, seven statuses at 0", () => {
  assert.deepEqual(totals([], current), { gross: 0, orders: 0, averageOrder: null, returnRate: null });
  const days = daily([], dayRanges(current));
  assert.equal(days.length, 30);
  assert.ok(days.every((p) => p.revenue === 0 && p.orders === 0));
  assert.deepEqual(
    statusSplit([], current),
    ORDER_STATUSES.map((status) => ({ status, count: 0 }))
  );
  assert.deepEqual(topProducts([], [], current), []);
  assert.deepEqual(byCategory([], [], current, new Map()), []);
});

test("gross and orders count processing, shipped and delivered; the split counts every status", () => {
  const orders = [
    order(1, "2026-11-09T16:00:00Z", "processing", "120.50"), // today's first instant; numeric as a string
    order(2, "2026-11-09T15:59:59.999Z", "shipped", 80), // the day before
    order(3, "2026-11-01T02:00:00Z", "delivered", 100),
    order(4, "2026-11-01T02:00:00Z", "pending", 999),
    order(5, "2026-11-01T02:00:00Z", "cancelled", 999),
    order(6, "2026-10-11T15:59:59.999Z", "delivered", 500), // the previous window
    order(7, "2026-11-02T00:00:00Z", "on_hold", 50), // a status the dashboards do not know
  ];
  const t = totals(orders, current);
  assert.equal(t.gross, 300.5);
  assert.equal(t.orders, 3);
  assert.equal(t.averageOrder, 100.17);
  assert.equal(totals(orders, previous).gross, 500);
  const split = statusSplit(orders, current);
  assert.deepEqual(split.map((s) => s.status), [...ORDER_STATUSES, "on_hold"]);
  assert.deepEqual(split.map((s) => s.count), [1, 1, 1, 1, 1, 0, 0, 1]);
  const days = daily(orders, dayRanges(current));
  assert.deepEqual(days.at(-1), { day: "2026-11-10", revenue: 120.5, orders: 1 });
  assert.deepEqual(days.at(-2), { day: "2026-11-09", revenue: 80, orders: 1 });
  const cents = [order(8, "2026-11-01T00:00:00Z", "delivered", 0.1), order(9, "2026-11-01T00:00:00Z", "delivered", 0.2)];
  assert.equal(totals(cents, current).gross, 0.3); // not 0.30000000000000004
});

test("return rate: a declined return counts, an old delivery without delivered_at counts, none is null", () => {
  const orders = [
    // Declined: back to delivered, but the request's time stays.
    order(1, "2026-11-01T00:00:00Z", "delivered", 10, {
      delivered_at: "2026-11-03T00:00:00Z",
      return_requested_at: "2026-11-04T00:00:00Z",
    }),
    order(2, "2026-11-01T00:00:00Z", "delivered", 10), // delivered before 0014 set delivered_at
    order(3, "2026-11-01T00:00:00Z", "returned", 10, { return_requested_at: "2026-11-03T00:00:00Z" }),
    order(4, "2026-11-01T00:00:00Z", "shipped", 10),
  ];
  assert.equal(totals(orders, current).returnRate, 2 / 3);
  assert.equal(totals([order(9, "2026-11-01T00:00:00Z", "shipped", 10)], current).returnRate, null);
});

test("categories: the top 8 by sales, then Other with the rest; exactly 8 has no Other", () => {
  const orders = [order(1, "2026-11-01T00:00:00Z", "delivered", 550)];
  const lines = Array.from({ length: 10 }, (_, i) => ({
    order_id: 1,
    product_id: i + 1,
    quantity: 1,
    unit_price: (i + 1) * 10,
  }));
  const categoryOf = new Map(lines.map((l) => [l.product_id, `Category ${l.product_id}`]));
  const ten = byCategory(orders, lines, current, categoryOf);
  assert.equal(ten.length, 9);
  assert.deepEqual(ten[0], { label: "Category 10", value: 100 });
  assert.deepEqual(ten.at(-1), { label: "Other", value: 30 }); // categories 2 and 1
  assert.equal(ten.reduce((n, c) => n + c.value, 0), 550);
  const eight = byCategory(orders, lines.slice(2), current, categoryOf);
  assert.equal(eight.length, 8);
  assert.ok(!eight.some((c) => c.label === "Other"));
  const loose = [
    { order_id: 1, product_id: null, quantity: 2, unit_price: 5 }, // product deleted
    { order_id: 1, product_id: 99, quantity: 1, unit_price: 3 }, // no category
  ];
  assert.deepEqual(byCategory(orders, loose, current, categoryOf), [{ label: "Uncategorised", value: 13 }]);
});

test("top products: by units, ties by revenue, then by product id", () => {
  const orders = [order(1, "2026-11-01T00:00:00Z", "processing", 0), order(2, "2026-11-01T00:00:00Z", "pending", 0)];
  const lines = [
    { order_id: 1, product_id: 7, quantity: 3, unit_price: 10 },
    { order_id: 1, product_id: 5, quantity: 3, unit_price: 20 },
    { order_id: 1, product_id: 3, quantity: 3, unit_price: 20 },
    { order_id: 1, product_id: 9, quantity: 1, unit_price: 500 },
    { order_id: 1, product_id: 4, quantity: 2, unit_price: 1 },
    { order_id: 1, product_id: 2, quantity: 2, unit_price: 1 },
    { order_id: 1, product_id: null, quantity: 9, unit_price: 1 }, // product deleted
    { order_id: 2, product_id: 8, quantity: 50, unit_price: 1 }, // a pending order
  ];
  const top = topProducts(orders, lines, current);
  assert.deepEqual(top.map((p) => p.productId), [3, 5, 7, 2, 4]);
  assert.deepEqual(top[0], { productId: 3, units: 3, revenue: 60 });
});

test("gross sales equal the sum of every seller's; a null subtotal falls back to its lines", () => {
  const orders = [
    order(1, "2026-11-01T00:00:00Z", "delivered", "250.25", { seller_id: 1 }),
    order(2, "2026-11-02T00:00:00Z", "shipped", 99.75, { seller_id: 2 }),
    order(3, "2026-11-03T00:00:00Z", "processing", null, { seller_id: 2 }),
    order(4, "2026-11-03T00:00:00Z", "processing", 10, { seller_id: null }),
  ];
  const lines = lineTotals([{ order_id: 3, product_id: 1, quantity: 2, unit_price: "12.50" }]);
  const all = totals(orders, current, lines).gross;
  assert.equal(all, 385);
  const bySeller = Map.groupBy(orders, (o) => o.seller_id);
  const sum = [...bySeller.values()].reduce((n, group) => n + totals(group, current, lines).gross, 0);
  assert.equal(sum, all);
  assert.equal(totals([orders[2]], current).gross, 0); // no lines given: 0, not a guess
});

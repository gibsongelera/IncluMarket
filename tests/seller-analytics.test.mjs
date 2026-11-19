// lib/analytics/seller.ts (04 §3–§4): the seller dashboard's widgets from
// plain rows. The module is pure, so it is imported by its .ts path (see the
// header of tests/format.test.mjs); the counting rule, the ranges and the
// words are passed in, so these tests pass the real modules, as
// lib/seller-analytics.ts does.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as aggregate from "../lib/analytics/aggregate.ts";
import { dayRanges, weekBlocks, windows } from "../lib/analytics/windows.ts";
import { shortName, statusLabel } from "../lib/format.ts";
import { variantLabel } from "../lib/pricing/core.ts";
import {
  bestSellers,
  firstLine,
  latestReviews,
  recentOrders,
  runningLow,
  sellerKpis,
  sellerWidgets,
  statusBreakdown,
  unitsByBucket,
  weekLabel,
  weeklySales,
} from "../lib/analytics/seller.ts";

/** 1:00 pm on 10 November 2026 in Manila. */
const NOW = Date.parse("2026-11-10T05:00:00Z");
const { current, previous } = windows(NOW);
const spans = { current, previous, days: dayRanges(current), weeks: weekBlocks(NOW, 12) };
const tools = { aggregate, statusLabel, optionLabel: variantLabel, shortName };

const order = (id, created_at, order_status, subtotal, extra = {}) => ({
  id,
  buyer_id: 100 + id,
  created_at,
  order_status,
  subtotal,
  seller_id: 1,
  ...extra,
});
const line = (order_id, product_id, quantity, unit_price) => ({ order_id, product_id, quantity, unit_price });
const product = (id, title) => ({ id, title });

/** Every number anywhere in a value is finite (no NaN, no Infinity). */
function allFinite(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allFinite);
  if (value && typeof value === "object") return Object.values(value).every(allFinite);
  return true;
}

test("weekly: a Manila week edge puts midnight in the new week and a millisecond before in the old", () => {
  const w = spans.weeks;
  assert.equal(new Date(w[11].start).toISOString(), "2026-11-03T16:00:00.000Z"); // 4 Nov, 00:00 in Manila
  const orders = [
    order(1, "2026-11-03T16:00:00Z", "delivered", 100), // the last week's first instant
    order(2, "2026-11-03T15:59:59.999Z", "shipped", 40), // the week before's last
    order(3, "2026-11-03T16:00:00Z", "pending", 999), // not counted
    order(4, "2026-08-18T15:59:59.999Z", "delivered", 999), // before the 12 weeks
    order(5, "2026-08-18T16:00:00Z", "processing", "25.50"), // the first week's first instant
  ];
  const weeks = weeklySales(orders, w, aggregate);
  assert.equal(weeks.length, 12);
  assert.deepEqual(weeks[11], { firstDay: "2026-11-04", lastDay: "2026-11-10", label: "11/4–11/10", sales: 100, orders: 1 });
  assert.deepEqual(weeks[10], { firstDay: "2026-10-28", lastDay: "2026-11-03", label: "10/28–11/3", sales: 40, orders: 1 });
  assert.deepEqual([weeks[0].label, weeks[0].sales, weeks[0].orders], ["8/19–8/25", 25.5, 1]);
  assert.equal(weeks.reduce((n, wk) => n + wk.orders, 0), 3);
  assert.equal(weekLabel("2026-12-29", "2027-01-04"), "12/29–1/4");
});

test("counted rule: processing, shipped and delivered count; pending, cancelled and returns do not", () => {
  const orders = [
    order(1, "2026-11-01T00:00:00Z", "processing", 10),
    order(2, "2026-11-01T00:00:00Z", "shipped", 20),
    order(3, "2026-11-01T00:00:00Z", "delivered", 30),
    order(4, "2026-11-01T00:00:00Z", "pending", 1000),
    order(5, "2026-11-01T00:00:00Z", "cancelled", 1000),
    order(6, "2026-11-01T00:00:00Z", "return_requested", 1000),
    order(7, "2026-11-01T00:00:00Z", "returned", 1000),
  ];
  const k = sellerKpis(orders, [], spans, aggregate);
  assert.equal(k.sales.value, 60);
  assert.equal(k.orders.value, 3);
  assert.equal(k.sales.label, "Sales (last 30 days)");
  assert.equal(k.sales.href, "/seller/finance");
  assert.equal(k.orders.href, "/seller/orders");
  assert.equal(k.sales.format, "money");
  assert.equal(k.orders.format, "count");
});

test("sales are Σ orderGross of the counted orders in the window, and the sellers add up to the admin's gross", () => {
  const sellerA = [
    order(1, "2026-11-09T16:00:00Z", "delivered", "120.50"), // today's first instant; numeric as a string
    order(2, "2026-10-11T16:00:00Z", "shipped", 80), // the window's first instant
    order(3, "2026-10-11T15:59:59.999Z", "delivered", 500), // just before the window
  ];
  // A null subtotal (should not exist after 0015) falls back to the order's own lines, as orderGross does.
  const sellerB = [order(4, "2026-11-05T00:00:00Z", "processing", null, { seller_id: 2 }), order(5, "2026-11-05T00:00:00Z", "delivered", 0.1, { seller_id: 2 })];
  const linesB = [line(4, 9, 2, 12.5), line(5, 9, 1, 0.1)];
  const a = sellerKpis(sellerA, [], spans, aggregate);
  const b = sellerKpis(sellerB, linesB, spans, aggregate);
  const expectA = sellerA
    .filter((o) => aggregate.isCounted(o.order_status) && Date.parse(o.created_at) >= current.start)
    .reduce((n, o) => n + aggregate.orderGross(o), 0);
  assert.equal(a.sales.value, expectA);
  assert.equal(a.sales.value, 200.5);
  assert.equal(b.sales.value, 25.1);
  const admin = aggregate.totals([...sellerA, ...sellerB], current, aggregate.lineTotals(linesB));
  assert.equal(Math.round((a.sales.value + b.sales.value) * 100) / 100, admin.gross);
  assert.equal(a.orders.value + b.orders.value, admin.orders);
  // The daily series adds up to the figure.
  assert.equal(a.sales.series.length, 30);
  assert.equal(Math.round(a.sales.series.reduce((n, v) => n + v, 0) * 100) / 100, 200.5);
  assert.equal(a.sales.series.at(-1), 120.5);
  assert.equal(a.sales.series[0], 80);
});

test("previous window: the 30 days before, and none at all when the read was clipped", () => {
  const orders = [
    order(1, "2026-11-01T00:00:00Z", "delivered", 100),
    order(2, "2026-10-11T15:59:59.999Z", "delivered", 40), // the previous window's last instant
    order(3, "2026-09-11T16:00:00Z", "shipped", 60), // its first
    order(4, "2026-09-11T15:59:59.999Z", "shipped", 999), // before it
  ];
  const lines = [line(1, 1, 3, 10), line(2, 1, 2, 10), line(3, 2, 4, 15), line(4, 2, 9, 1)];
  const k = sellerKpis(orders, lines, spans, aggregate);
  assert.deepEqual([k.sales.value, k.sales.previous], [100, 100]);
  assert.deepEqual([k.orders.value, k.orders.previous], [1, 2]);
  assert.deepEqual([k.itemsSold.value, k.itemsSold.previous], [3, 6]);
  const clipped = sellerKpis(orders, lines, spans, aggregate, true);
  assert.equal(clipped.sales.previous, null);
  assert.equal(clipped.orders.previous, null);
  assert.equal(clipped.itemsSold.previous, null);
  assert.equal(clipped.sales.value, 100); // the current figure stays
});

test("items sold: units in the lines of counted orders only, per Manila day", () => {
  const orders = [
    order(1, "2026-11-09T16:00:00Z", "delivered", 0), // today
    order(2, "2026-11-01T00:00:00Z", "pending", 0),
    order(3, "2026-11-01T00:00:00Z", "cancelled", 0),
    order(4, "2026-11-01T00:00:00Z", "shipped", 0),
  ];
  const lines = [line(1, 1, 2, 5), line(1, 2, "3", "5"), line(2, 1, 50, 5), line(3, 1, 70, 5), line(4, null, 4, 5), line(99, 1, 8, 5)];
  const k = sellerKpis(orders, lines, spans, aggregate);
  assert.equal(k.itemsSold.value, 9); // 2 + 3 today, 4 on 1 Nov (a deleted product's line still sold)
  assert.equal(k.itemsSold.series.length, 30);
  assert.equal(k.itemsSold.series.at(-1), 5);
  assert.equal(k.itemsSold.series.reduce((n, v) => n + v, 0), 9);
  assert.deepEqual(unitsByBucket(orders, lines, [previous], aggregate), [0]);
  // Lines that could not be read: no items sold, the rest still stands.
  const noLines = sellerKpis(orders, null, spans, aggregate);
  assert.equal(noLines.itemsSold, null);
  assert.equal(noLines.orders.value, 2);
});

test("best sellers: by units, ties by sales then title; own products only, at most 8", () => {
  const orders = [
    order(1, "2026-11-01T00:00:00Z", "delivered", 0),
    order(2, "2026-11-02T00:00:00Z", "shipped", 0),
    order(3, "2026-11-02T00:00:00Z", "pending", 0), // not counted
    order(4, "2026-10-01T00:00:00Z", "delivered", 0), // outside the window
  ];
  const products = [product(1, "Woven bag"), product(2, "Clay pot"), product(3, "Bamboo fan"), product(4, "Abaca mat"), product(5, "Candle")];
  const lines = [
    line(1, 1, 5, 10), // Woven bag: 5 units, ₱50
    line(1, 2, 3, 30), // Clay pot: 3 units, ₱90
    line(2, 3, 3, 20), // Bamboo fan: 3 units, ₱60
    line(2, 4, 3, 30), // Abaca mat: 3 units, ₱90, ties Clay pot on units and sales: by title
    line(3, 5, 99, 1), // pending
    line(4, 5, 99, 1), // outside the window
    line(2, 77, 50, 1), // another seller's product: not in the index
    line(2, null, 50, 1), // a deleted product
  ];
  const top = bestSellers(orders, lines, current, products, aggregate);
  assert.deepEqual(
    top.map((p) => [p.title, p.units, p.sales]),
    [
      ["Woven bag", 5, 50],
      ["Abaca mat", 3, 90],
      ["Clay pot", 3, 90],
      ["Bamboo fan", 3, 60],
    ]
  );
  assert.ok(top.every((p) => p.image === null));
  const many = Array.from({ length: 12 }, (_, i) => product(i + 10, `Item ${String(i).padStart(2, "0")}`));
  const manyLines = many.map((p, i) => line(1, p.id, i + 1, 1));
  const eight = bestSellers(orders, manyLines, current, many, aggregate);
  assert.equal(eight.length, 8);
  assert.equal(eight[0].units, 12);
});

test("running low: 1 to 5 left, the fewest first; 0 and 6 are left out; 8 listed, all counted", () => {
  const products = [product(1, "Woven bag"), product(2, "Clay pot")];
  const v = (id, product_id, stock_qty, color_name = "Blue", size = null) => ({
    id,
    product_id,
    color_name,
    size,
    stock_qty,
    sku_code: "",
  });
  const variants = [
    v(1, 1, 0),
    v(2, 1, 6),
    v(3, 1, 5, "Red", "M"),
    v(4, 1, 1, "Green"),
    v(5, 2, "1", ""), // numeric as a string, no colour
    v(6, 99, 2), // not this seller's
  ];
  const low = runningLow(variants, products, variantLabel, aggregate.num);
  assert.equal(low.total, 3);
  assert.deepEqual(
    low.items.map((i) => [i.productTitle, i.option, i.left]),
    [
      ["Clay pot", "Standard", 1],
      ["Woven bag", "Green", 1],
      ["Woven bag", "Red · M", 5],
    ]
  );
  const lots = Array.from({ length: 11 }, (_, i) => v(100 + i, 1, (i % 5) + 1));
  const capped = runningLow(lots, products, variantLabel, aggregate.num);
  assert.equal(capped.total, 11);
  assert.equal(capped.items.length, 8);
  assert.ok(capped.items.every((it, i, all) => i === 0 || all[i - 1].left <= it.left));
});

test("latest reviews: the 3 newest of own products, first line cut to about 120 characters", () => {
  const products = [product(1, "Woven bag"), product(2, "Clay pot")];
  const r = (id, productId, createdAt, comment, sellerReply = null) => ({
    id,
    productId,
    rating: 4,
    comment,
    createdAt,
    reviewer: "Maria S.",
    verifiedPurchase: true,
    sellerReply,
    sellerReplyAt: null,
  });
  const long = "Beautiful work ".repeat(20).trim();
  const reviews = [
    r(1, 1, "2026-11-01T00:00:00Z", "Old one"),
    r(2, 2, "2026-11-08T00:00:00Z", "  Lovely pot.\nSecond line is not shown.", "Thank you!"),
    r(3, 1, "2026-11-09T00:00:00Z", long),
    r(4, 99, "2026-11-10T00:00:00Z", "Another seller's product"),
    r(5, 1, "2026-11-08T00:00:00Z", null, "   "), // same time as #2: the higher id first
  ];
  const latest = latestReviews(reviews, products);
  assert.deepEqual(latest.map((x) => x.id), [3, 5, 2]);
  assert.equal(latest[0].productTitle, "Woven bag");
  assert.ok(latest[0].comment.endsWith("…"));
  assert.ok([...latest[0].comment].length <= 120);
  assert.ok(long.startsWith(latest[0].comment.slice(0, -1)));
  assert.ok(!latest[0].comment.slice(0, -1).endsWith(" ")); // cut at a word
  assert.equal(latest[1].comment, null);
  assert.equal(latest[1].replied, false); // a blank reply is no reply
  assert.equal(latest[2].comment, "Lovely pot.");
  assert.equal(latest[2].replied, true);
  assert.equal(firstLine("x".repeat(200)), `${"x".repeat(119)}…`);
  assert.equal(firstLine("   \n  "), null);
  assert.equal(firstLine("a  b\tc"), "a b c");
  const emoji = firstLine("🙂".repeat(130));
  assert.equal([...emoji].length, 120); // whole emoji, never half of one
});

test("status: every order in the window by status, zeros kept, with the pill's words and the total", () => {
  const orders = [
    order(1, "2026-11-01T00:00:00Z", "pending", 1),
    order(2, "2026-11-01T00:00:00Z", "pending", 1),
    order(3, "2026-11-01T00:00:00Z", "return_requested", 1),
    order(4, "2026-10-01T00:00:00Z", "delivered", 1), // outside the window
  ];
  const s = statusBreakdown(orders, current, aggregate, statusLabel);
  assert.equal(s.total, 3);
  assert.deepEqual(s.byStatus.map((x) => x.status), [...aggregate.ORDER_STATUSES]);
  assert.deepEqual(s.byStatus.map((x) => x.count), [2, 0, 0, 0, 0, 1, 0]);
  assert.equal(s.byStatus[5].label, "Return requested");
  assert.equal(s.byStatus[1].label, "Processing");
});

test("recent orders: the 8 newest of any status, short buyer names, orderGross", () => {
  const orders = Array.from({ length: 10 }, (_, i) =>
    order(i + 1, `2026-11-0${(i % 9) + 1}T00:00:00Z`, i % 2 ? "pending" : "delivered", 10 * (i + 1))
  );
  const names = { 101: "Juan Dela Cruz", 110: "Ana" };
  const recent = recentOrders(orders, names, shortName, aggregate);
  assert.equal(recent.length, 8);
  assert.deepEqual(recent.map((o) => o.id), [9, 8, 7, 6, 5, 4, 3, 2]); // newest first; orders 10 and 1 (1 Nov) are the oldest
  const all = recentOrders(orders, names, shortName, aggregate, null, 10);
  assert.deepEqual(all.slice(-2).map((o) => o.id), [10, 1]); // the same time: the higher id first
  const juan = recentOrders(orders.slice(0, 1), names, shortName, aggregate)[0];
  assert.deepEqual(juan, { id: 1, buyer: "Juan C.", createdAt: "2026-11-01T00:00:00Z", amount: 10, status: "delivered" });
  assert.equal(recentOrders([order(3, "2026-11-01T00:00:00Z", "pending", 5)], {}, shortName, aggregate)[0].buyer, "Buyer");
});

test("empty input gives empty widgets with zeros, never NaN; unread rows give null widgets", () => {
  const empty = sellerWidgets(
    { orders: [], lines: [], recent: [], products: [], variants: [], reviews: [], names: {}, partial: false },
    spans,
    tools
  );
  assert.ok(allFinite(empty));
  assert.deepEqual([empty.kpis.sales.value, empty.kpis.sales.previous], [0, 0]);
  assert.equal(empty.kpis.orders.value, 0);
  assert.equal(empty.kpis.itemsSold.value, 0);
  assert.equal(empty.kpis.sales.series.length, 30);
  assert.ok(empty.kpis.itemsSold.series.every((n) => n === 0));
  assert.equal(empty.weekly.length, 12);
  assert.ok(empty.weekly.every((w) => w.sales === 0 && w.orders === 0));
  assert.equal(empty.status.total, 0);
  assert.equal(empty.status.byStatus.length, 7);
  assert.deepEqual(empty.bestSellers, []);
  assert.deepEqual(empty.runningLow, { total: 0, items: [] });
  assert.deepEqual(empty.recentOrders, []);
  assert.deepEqual(empty.latestReviews, []);

  const unread = sellerWidgets(
    { orders: null, lines: null, recent: null, products: null, variants: null, reviews: null, names: {}, partial: false },
    spans,
    tools
  );
  assert.deepEqual(unread, {
    kpis: { sales: null, orders: null, itemsSold: null },
    weekly: null,
    status: null,
    bestSellers: null,
    runningLow: null,
    recentOrders: null,
    latestReviews: null,
  });
  // Orders read, lines not: the figures from subtotals stand, the ones from lines are null.
  const noLines = sellerWidgets(
    { orders: [order(1, "2026-11-01T00:00:00Z", "delivered", 5)], lines: null, recent: [], products: [], variants: [], reviews: [], names: {}, partial: false },
    spans,
    tools
  );
  assert.equal(noLines.kpis.sales.value, 5);
  assert.equal(noLines.kpis.itemsSold, null);
  assert.equal(noLines.bestSellers, null);
  assert.equal(noLines.weekly.at(-2).sales, 5);
});

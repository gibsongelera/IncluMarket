// lib/stock-episodes.ts (0027): sell-outs paired with the restock after them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { soldOutEpisodes, episodeState } from "../lib/stock-episodes.ts";

const ev = (id, product_id, kind, occurred_at, approximate = false) => ({
  id, product_id, seller_id: 9, title: `Item ${product_id}`, kind, approximate, occurred_at,
});

test("a sell-out and the restock after it make one episode", () => {
  const [e] = soldOutEpisodes([
    ev(2, 1, "restocked", "2026-03-02T08:00:00Z"),
    ev(1, 1, "sold_out", "2026-03-01T08:00:00Z"),
  ]);
  assert.equal(e.eventId, 1);
  assert.equal(e.soldOutAt, "2026-03-01T08:00:00Z");
  assert.equal(e.restockedAt, "2026-03-02T08:00:00Z");
});

test("a listing can sell out again; newest sell-out first", () => {
  const list = soldOutEpisodes([
    ev(1, 1, "sold_out", "2026-03-01T08:00:00Z"),
    ev(2, 1, "restocked", "2026-03-02T08:00:00Z"),
    ev(3, 1, "sold_out", "2026-03-05T08:00:00Z"),
    ev(4, 2, "sold_out", "2026-03-03T08:00:00Z", true),
  ]);
  assert.deepEqual(list.map((e) => e.eventId), [3, 4, 1]);
  assert.equal(list[0].restockedAt, null);
  assert.equal(list[1].approximate, true);
});

test("a restock whose sell-out was not read is ignored", () => {
  assert.deepEqual(soldOutEpisodes([ev(7, 1, "restocked", "2026-03-02T08:00:00Z")]), []);
});

test("two sell-outs in a row are both kept", () => {
  const list = soldOutEpisodes([
    ev(1, 1, "sold_out", "2026-03-01T08:00:00Z"),
    ev(2, 1, "sold_out", "2026-03-04T08:00:00Z"),
  ]);
  assert.deepEqual(list.map((e) => [e.eventId, e.restockedAt]), [[2, null], [1, null]]);
});

test("where an episode stands now", () => {
  const [open] = soldOutEpisodes([ev(1, 1, "sold_out", "2026-03-01T08:00:00Z")]);
  assert.equal(episodeState(open, { stock_total: 0 }), "sold_out");
  assert.equal(episodeState(open, { stock_total: 3 }), "restocked");
  assert.equal(episodeState(open, null), "deleted");
  const [closed] = soldOutEpisodes([ev(1, 1, "sold_out", "2026-03-01T08:00:00Z"), ev(2, 1, "restocked", "2026-03-02T08:00:00Z")]);
  assert.equal(episodeState(closed, null), "restocked");
});

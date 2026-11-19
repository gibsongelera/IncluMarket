// lib/rail.ts (P4-02): where a RailScroller's track is, which decides when
// Previous / Next are aria-disabled, whether they show at all, and the
// hero's "2 of 4".
import { test } from "node:test";
import assert from "node:assert/strict";
import { pageDelta, railPosition } from "../lib/rail.ts";

const at = (scrollLeft, scrollWidth = 3000, clientWidth = 1000, count = 15) =>
  railPosition({ scrollLeft, scrollWidth, clientWidth }, count);

test("railPosition: nothing overflows, so no buttons and both ends", () => {
  assert.deepEqual(at(0, 1000, 1000, 3), { overflow: false, atStart: true, atEnd: true, index: 0 });
  // A 1px rounding difference is not overflow.
  assert.equal(at(0, 1001, 1000, 3).overflow, false);
  assert.equal(at(0, 1002, 1000, 3).overflow, true);
});

test("railPosition: at the start, Previous is the only end", () => {
  assert.deepEqual(at(0), { overflow: true, atStart: true, atEnd: false, index: 0 });
  assert.equal(at(0.6).atStart, true, "sub-pixel scrollLeft still counts as the start");
  assert.equal(at(2).atStart, false);
});

test("railPosition: at the end, Next is the only end, within 1px", () => {
  assert.deepEqual(at(2000), { overflow: true, atStart: false, atEnd: true, index: 2 });
  assert.equal(at(1999.5).atEnd, true, "999.5 of 1,000 is the end");
  assert.equal(at(1998).atEnd, false);
});

test("railPosition: in the middle, neither end", () => {
  const p = at(1000);
  assert.equal(p.atStart, false);
  assert.equal(p.atEnd, false);
  assert.equal(p.index, 1);
});

test("railPosition: the hero's view rounds to the nearest slide", () => {
  const hero = (left) => railPosition({ scrollLeft: left, scrollWidth: 3200, clientWidth: 800 }, 4).index;
  assert.equal(hero(0), 0);
  assert.equal(hero(399), 0);
  assert.equal(hero(401), 1);
  assert.equal(hero(800), 1);
  assert.equal(hero(2400), 3);
});

test("railPosition: overscroll is clamped to the ends", () => {
  assert.deepEqual(at(-40), { overflow: true, atStart: true, atEnd: false, index: 0 });
  assert.deepEqual(at(2050), { overflow: true, atStart: false, atEnd: true, index: 2 });
});

test("railPosition: the index never passes the item count, and a hidden track is safe", () => {
  assert.equal(railPosition({ scrollLeft: 2000, scrollWidth: 3000, clientWidth: 1000 }, 2).index, 1);
  assert.equal(railPosition({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 }, 0).index, 0);
  assert.deepEqual(railPosition({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 }, 4), {
    overflow: false,
    atStart: true,
    atEnd: true,
    index: 0,
  });
});

// pageDelta (P4-04): Previous / Next land on whole items.
const spans = (width, gap, count, offset = 0) =>
  Array.from({ length: count }, (_, k) => ({ start: offset + k * (width + gap), end: offset + k * (width + gap) + width }));

test("pageDelta: exact-fit cards page by the view plus one gap, as before", () => {
  // 3 cards of 100 with a gap of 10 fill a 320 view exactly.
  assert.equal(pageDelta(spans(100, 10, 9), 320, 1), 330);
  assert.equal(pageDelta(spans(100, 10, 9, -330), 320, -1), -330);
});

test("pageDelta: Next brings a half-visible tile to the start instead of skipping it", () => {
  // 120 tiles, gap 16, view 400: tiles 0-1 whole (0-120, 136-256), tile 2 cut (272-392 whole), tile 3 cut (408-528).
  const items = spans(120, 16, 8);
  assert.equal(pageDelta(items, 400, 1), 408, "tile 3, the first not wholly in view");
  assert.ok(pageDelta(items, 400, 1) < 400 + 16 + 120, "never further than one view");
});

test("pageDelta: Previous makes the tile cut on the left the last whole one", () => {
  // View starts at tile 3 (offset -408): tile 2 ends at -16.
  const items = spans(120, 16, 8, -408);
  const d = pageDelta(items, 400, -1);
  // The earliest tile that still lets tile 2 (end -16) fit in 400px starts at >= -416: tile 0 at -408.
  assert.equal(d, -408);
});

test("pageDelta: nothing further that way → null", () => {
  assert.equal(pageDelta(spans(100, 10, 3), 320, 1), null);
  assert.equal(pageDelta(spans(100, 10, 3), 320, -1), null);
  assert.equal(pageDelta([], 320, 1), null);
});

test("pageDelta: an item wider than the view pages by the view", () => {
  assert.equal(pageDelta([{ start: 0, end: 900 }], 400, 1), 400);
});

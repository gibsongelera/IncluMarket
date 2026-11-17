// lib/rail.ts (P4-02): where a RailScroller's track is, which decides when
// Previous / Next are aria-disabled, whether they show at all, and the
// hero's "2 of 4".
import { test } from "node:test";
import assert from "node:assert/strict";
import { railPosition } from "../lib/rail.ts";

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

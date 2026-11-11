// The pure parts of lib/charts.ts (01 §2.4, D-07): axis scales, tick text,
// shares, donut angles, label fitting and placement, and the colour lookups.
// The drawing needs a browser; these do not. lib/charts.ts has no runtime
// imports, so it is imported by its .ts path (see tests/format.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compact,
  cssColor,
  donutAngles,
  fitText,
  formatValue,
  niceScale,
  placeLabels,
  segmentColor,
  seriesColor,
  shares,
  statusToken,
  wrapText,
} from "../lib/charts.ts";

/** One unit per character, so widths are easy to reason about. */
const chars = (text) => Array.from(text).length;

test("niceScale: round steps, whole ones for counts, at most the intervals asked", () => {
  assert.deepEqual(niceScale(17, 4), { top: 20, step: 5 });
  assert.deepEqual(niceScale(3, 4), { top: 3, step: 1 });
  assert.deepEqual(niceScale(5, 2), { top: 5, step: 5 }); // never a 2.5 step for counts
  assert.deepEqual(niceScale(100, 4), { top: 100, step: 25 });
  assert.deepEqual(niceScale(128430, 4), { top: 150000, step: 50000 });
  assert.deepEqual(niceScale(0.6, 4), { top: 0.6, step: 0.2 });
  assert.deepEqual(niceScale(0, 4), { top: 1, step: 1 });
  assert.deepEqual(niceScale(Number.NaN, 4), { top: 1, step: 1 });
  for (let max = 1; max <= 2500; max += 7) {
    for (let n = 1; n <= 4; n++) {
      const { top, step } = niceScale(max, n);
      assert.ok(top >= max, `top ${top} under ${max}`);
      assert.ok(Number.isInteger(step), `step ${step} for ${max}`);
      const count = top / step;
      assert.ok(Number.isInteger(count) && count <= n, `${count} steps for ${max} in ${n}`);
    }
  }
});

test("compact ticks and full figures", () => {
  assert.equal(compact(0, true), "₱0");
  assert.equal(compact(12), "12");
  assert.equal(compact(0.25), "0.25");
  assert.equal(compact(1000), "1k");
  assert.equal(compact(2500), "2.5k");
  assert.equal(compact(150000, true), "₱150k");
  assert.equal(compact(1200000), "1.2M");
  assert.equal(formatValue(1234), "1,234");
  assert.equal(formatValue(128430.4, true), "₱128,430");
  assert.equal(formatValue(Number.NaN), "—");
});

test("shares: the nearest whole percent, so equal counts read the same", () => {
  assert.deepEqual(shares([3, 3, 3]), [33, 33, 33]);
  assert.deepEqual(shares([6, 3, 2, 2]), [46, 23, 15, 15]); // largest remainder gave 16 and 15
  assert.deepEqual(shares([1, 0, 2]), [33, 0, 67]);
  assert.deepEqual(shares([1, 7]), [13, 88]); // 12.5 and 87.5: a half rounds up
  assert.deepEqual(shares([0, 0]), [0, 0]);
  assert.deepEqual(shares([1, 999]), [0, 100]); // the legend says "under 1%" and "over 99%"
  assert.deepEqual(shares([-4, Number.NaN, 2]), [0, 0, 100]);
  for (const values of [[1, 1, 1, 1, 1, 1, 1], [5, 9, 13, 2, 0, 7, 1], [24, 1, 1], [333, 333, 334]]) {
    const total = values.reduce((a, b) => a + b, 0);
    shares(values).forEach((s, i) => assert.ok(Math.abs(s - (values[i] * 100) / total) <= 0.5, String(values)));
  }
});

test("donutAngles: a full turn, zeros stay zero, a tiny segment stays visible", () => {
  const turn = 2 * Math.PI;
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const a = donutAngles([3, 0, 1]);
  assert.ok(Math.abs(sum(a) - turn) < 1e-9);
  assert.equal(a[1], 0);
  assert.ok(Math.abs(a[0] - 3 * a[2]) < 1e-9);
  assert.deepEqual(donutAngles([5]), [turn]);
  assert.deepEqual(donutAngles([0, 0]), [0, 0]);
  const min = 0.05;
  const b = donutAngles([1, 1000, 0], min);
  assert.ok(Math.abs(b[0] - min) < 1e-12, "lifted to the minimum");
  assert.ok(Math.abs(sum(b) - turn) < 1e-9, "still a full turn");
  assert.equal(b[2], 0);
});

test("fitText and wrapText cut with an ellipsis, never mid code point", () => {
  assert.equal(fitText(chars, "abcdef", 6), "abcdef");
  assert.equal(fitText(chars, "abcdef", 4), "abc…");
  assert.equal(fitText(chars, "ab cdef", 4), "ab…"); // no space before the ellipsis
  assert.equal(fitText(chars, "abc", 0.5), "");
  assert.equal(fitText(chars, "a😀b😀c", 3), "a😀…");
  assert.deepEqual(wrapText(chars, "aa bb cc dd", 5), ["aa bb", "cc dd"]);
  assert.deepEqual(wrapText(chars, "aa bb cc dd ee", 5), ["aa bb", "cc d…"]);
  assert.deepEqual(wrapText(chars, "Supercalifragilistic tote", 8), ["Superca…", "tote"]);
  assert.deepEqual(wrapText(chars, "   ", 8), []);
});

test("placeLabels: dates are thinned from the latest, never cut or overlapping", () => {
  const labels = Array.from({ length: 14 }, (_, i) => `11/${String(i + 1).padStart(2, "0")}`);
  const centres = labels.map((_, i) => 30 + i * 20);
  const placed = placeLabels((t) => chars(t) * 10, labels, centres, { minX: 0, maxX: 320, gap: 10, anchor: "end" });
  assert.equal(placed.at(-1).text, labels.at(-1), "the latest day keeps its label");
  for (const p of placed) {
    assert.ok(labels.includes(p.text), `${p.text} is whole`);
    assert.ok(p.left >= 0 && p.left + p.width <= 320, `${p.text} inside`);
  }
  for (let i = 1; i < placed.length; i++) {
    assert.ok(placed[i].left >= placed[i - 1].left + placed[i - 1].width + 10, "a gap between labels");
  }
  // 50 wide each, 20 apart: every third label, from the last.
  assert.deepEqual(placed.map((p) => p.text), ["11/02", "11/05", "11/08", "11/11", "11/14"]);
});

test("placeLabels: category labels are cut to their room, keeping four characters", () => {
  const labels = ["Rattan tote bag", "Embroidered pouch", "Clay mug", "Woven placemat set"];
  const centres = [40, 120, 200, 280];
  const placed = placeLabels(chars, labels, centres, { minX: 0, maxX: 320, gap: 8, anchor: "start", truncate: true });
  assert.equal(placed.length, 4);
  for (const [i, p] of placed.entries()) {
    assert.ok(p.width <= 72, `${p.text} fits its 72 of room`);
    assert.ok(p.text === labels[i] || (p.text.endsWith("…") && chars(p.text) - 1 >= 4), p.text);
  }
});

test("colours: tokens by status, by series position, or the caller's own", () => {
  assert.equal(statusToken("pending"), "--status-warn");
  assert.equal(statusToken("return_requested"), "--palette-plum");
  assert.equal(statusToken("on_hold"), "--status-neutral");
  assert.equal(statusToken("constructor"), "--status-neutral"); // not Object.prototype
  assert.equal(segmentColor({ label: "Shipped", value: 2, status: "shipped" }, 0), "var(--palette-teal)");
  assert.equal(segmentColor({ label: "A", value: 1 }, 1), "var(--chart-2)");
  assert.equal(segmentColor({ label: "A", value: 1, status: "pending", color: "--brand-brown" }, 0), "var(--brand-brown)");
  assert.equal(seriesColor({ points: [] }, 2), "var(--chart-3)");
  assert.equal(seriesColor({ points: [], color: "var(--brand-brown)" }, 0), "var(--brand-brown)");
  assert.equal(cssColor(undefined, "--chart-1"), "var(--chart-1)");
  assert.equal(cssColor(" --x ", "--chart-1"), "var(--x)");
  assert.equal(cssColor("#0038A8", "--chart-1"), "#0038A8");
});

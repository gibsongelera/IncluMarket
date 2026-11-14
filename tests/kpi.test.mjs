// KPI trend wording and colour (lib/kpi.ts, 01 §6.1, 03 §4). Runs on Node's
// built-in runner; lib/kpi.ts is pure, so it is imported by its .ts path
// (see the header of tests/format.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { kpiTrend, rangeSummary } from "../lib/kpi.ts";

test("kpiTrend: the change to one decimal, against the previous period", () => {
  assert.deepEqual(kpiTrend(118.2, 100, "up"), {
    kind: "up",
    tone: "good",
    pct: 18.2,
    words: "up 18.2% vs previous 30 days (better)",
  });
  // 1 in 3 is 33.333...%; one decimal, and a trailing .0 is kept.
  assert.equal(kpiTrend(4, 3, "up").words, "up 33.3% vs previous 30 days (better)");
  assert.equal(kpiTrend(150, 100, "up").words, "up 50.0% vs previous 30 days (better)");
  assert.equal(kpiTrend(0, 250, "up").words, "down 100.0% vs previous 30 days (worse)");
});

test("kpiTrend: an exact .x5 rounds half away from zero, the same both ways", () => {
  // 2023 against 2000 is exactly 1.15%; toFixed(1) would say 1.1.
  assert.equal(kpiTrend(2023, 2000, "up").pct, 1.2);
  assert.equal(kpiTrend(2023, 2000, "up").words, "up 1.2% vs previous 30 days (better)");
  // 449 against 400 is exactly 12.25%.
  assert.equal(kpiTrend(449, 400, "up").words, "up 12.3% vs previous 30 days (better)");
  // 1 against 400 is exactly -99.75%; Math.round(x * 10) / 10 would say 99.7.
  assert.equal(kpiTrend(1, 400, "up").pct, -99.8);
  assert.equal(kpiTrend(1, 400, "up").words, "down 99.8% vs previous 30 days (worse)");
  assert.equal(kpiTrend(799, 400, "up").words, "up 99.8% vs previous 30 days (better)");
});

test("kpiTrend: percentages are grouped the en-PH way", () => {
  assert.equal(kpiTrend(5000, 100, "up").words, "up 4,900.0% vs previous 30 days (better)");
  assert.equal(kpiTrend(1234567.8 + 100, 100, "up").words, "up 1,234,567.8% vs previous 30 days (better)");
});

test("kpiTrend: a previous 0 is flat (both 0) or New, never a percentage", () => {
  const flat = { kind: "flat", tone: "neutral", words: "no change vs previous 30 days" };
  assert.deepEqual(kpiTrend(0, 0, "up"), flat);
  assert.deepEqual(kpiTrend(0, -0, "down"), flat);
  assert.deepEqual(kpiTrend(12, 0, "up"), {
    kind: "new",
    tone: "neutral",
    words: "New (none in the previous 30 days)",
  });
  // New is neutral whichever direction is good.
  assert.equal(kpiTrend(3, 0, "down").tone, "neutral");
});

test("kpiTrend: a change that rounds to 0.0% is flat", () => {
  const flat = { kind: "flat", tone: "neutral", words: "no change vs previous 30 days" };
  assert.deepEqual(kpiTrend(100.04, 100, "up"), flat);
  assert.deepEqual(kpiTrend(10000, 10001, "up"), flat); // -0.00999...%
  assert.deepEqual(kpiTrend(250, 250, "down"), flat);
  // 0.05% is the first change that shows (100.05 - 100 is 0.0499999... in binary).
  assert.equal(kpiTrend(100.05, 100, "up").words, "up 0.1% vs previous 30 days (better)");
});

test("kpiTrend: tone follows good or bad news, not up or down", () => {
  assert.equal(kpiTrend(12, 10, "up").tone, "good");
  assert.equal(kpiTrend(8, 10, "up").tone, "bad");
  // A falling return rate is good news.
  assert.deepEqual(kpiTrend(8, 10, "down"), {
    kind: "down",
    tone: "good",
    pct: -20,
    words: "down 20.0% vs previous 30 days (better)",
  });
  assert.deepEqual(kpiTrend(12, 10, "down"), {
    kind: "up",
    tone: "bad",
    pct: 20,
    words: "up 20.0% vs previous 30 days (worse)",
  });
});

test("kpiTrend: a missing or non-finite figure gives no trend", () => {
  for (const [current, previous] of [
    [null, 5],
    [5, null],
    [undefined, 5],
    [5, undefined],
    [NaN, 5],
    [5, NaN],
    [Infinity, 5],
    [5, -Infinity],
  ]) {
    assert.deepEqual(kpiTrend(current, previous, "up"), { kind: "none" }, `${current} vs ${previous}`);
  }
});

test("kpiTrend: a negative previous divides by its size", () => {
  // -200 to -100 is a rise of 100 on a base of 200.
  assert.deepEqual(kpiTrend(-100, -200, "up"), {
    kind: "up",
    tone: "good",
    pct: 50,
    words: "up 50.0% vs previous 30 days (better)",
  });
  assert.equal(kpiTrend(-300, -200, "up").words, "down 50.0% vs previous 30 days (worse)");
  assert.equal(kpiTrend(-300, -200, "up").tone, "bad");
});

test("kpiTrend: the period words are the caller's", () => {
  assert.equal(kpiTrend(5, 0, "up", "previous 12 weeks").words, "New (none in the previous 12 weeks)");
  assert.equal(kpiTrend(6, 5, "up", "previous 12 weeks").words, "up 20.0% vs previous 12 weeks (better)");
  assert.equal(kpiTrend(5, 5, "up", "previous 12 weeks").words, "no change vs previous 12 weeks");
});

test("rangeSummary: lowest and highest in the caller's format, or no data yet", () => {
  const peso = (n) => `₱${n.toLocaleString("en-PH")}`;
  assert.equal(rangeSummary("Daily sales", [1500, 0, 6000, 3200], peso), "Daily sales, lowest ₱0, highest ₱6,000");
  assert.equal(rangeSummary("Daily orders", [null, 4, NaN, 2, undefined], String), "Daily orders, lowest 2, highest 4");
  assert.equal(rangeSummary("Daily orders", [7], String), "Daily orders, lowest 7, highest 7");
  assert.equal(rangeSummary("Daily sales", [], peso), "Daily sales: no data yet");
  assert.equal(rangeSummary("Daily sales", [null, NaN, Infinity], peso), "Daily sales: no data yet");
});

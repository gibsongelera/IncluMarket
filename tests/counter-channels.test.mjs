import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COUNTER_CHANNELS,
  channelLabel,
  cleanAccountNumber,
  cleanAmount,
  cleanReference,
  isCounterChannel,
  payBy,
} from "../lib/counter-channels.ts";

test("the Workshop takes GCash, Maribank and LandBank, in that order", () => {
  assert.deepEqual(COUNTER_CHANNELS.map((c) => c.id), ["gcash", "maribank", "lbp"]);
  assert.equal(isCounterChannel("lbp"), true);
  assert.equal(isCounterChannel("paypal"), false);
  assert.equal(isCounterChannel(undefined), false);
  assert.equal(channelLabel("lbp"), "LandBank (LBP)");
  assert.equal(channelLabel("nope"), "the Workshop");
});

test("a reference number is kept as the database checks it (0028)", () => {
  assert.equal(cleanReference("  GC-1234 5678 "), "GC-12345678");
  assert.equal(cleanReference("abc"), null);
  assert.equal(cleanReference("1234; drop"), null);
  assert.equal(cleanReference("x".repeat(41)), null);
  assert.equal(cleanReference(null), null);
});

test("an account number may have spaces and dashes, nothing else", () => {
  assert.equal(cleanAccountNumber(" 0917  123 4567 "), "0917 123 4567");
  assert.equal(cleanAccountNumber("0000-1111-22"), "0000-1111-22");
  assert.equal(cleanAccountNumber("<b>0917</b>"), null);
  assert.equal(cleanAccountNumber("12"), null);
});

test("an amount is pesos with up to two decimals", () => {
  assert.equal(cleanAmount("1,250.50"), 1250.5);
  assert.equal(cleanAmount("₱ 350"), 350);
  assert.equal(cleanAmount("0"), null);
  assert.equal(cleanAmount("-5"), null);
  assert.equal(cleanAmount("12.345"), null);
  assert.equal(cleanAmount("abc"), null);
  assert.equal(cleanAmount("100000000"), null);
});

test("an unpaid counter order is released after its hold", () => {
  assert.equal(payBy("2026-11-24T01:00:00Z", 48).toISOString(), "2026-11-26T01:00:00.000Z");
});

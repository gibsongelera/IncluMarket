import { test } from "node:test";
import assert from "node:assert/strict";
import { NOTIFICATION_GROUPS, REQUIRED_TYPES, groupOf, groupsFor } from "../lib/notification-types.ts";

test("every optional type belongs to exactly one group", () => {
  const seen = new Map();
  for (const g of NOTIFICATION_GROUPS) for (const t of g.types) {
    assert.ok(!seen.has(t), `${t} is in ${seen.get(t)} and ${g.key}`);
    seen.set(t, g.key);
  }
  assert.equal(groupOf("flash_sale").key, "deals");
  assert.equal(groupOf("nonsense"), null);
});

test("required notices can never be switched off", () => {
  for (const t of REQUIRED_TYPES) assert.equal(groupOf(t), null, `${t} must not appear in a settings group`);
});

test("people only see settings that apply to them", () => {
  assert.ok(groupsFor("buyer").some((g) => g.key === "deals"));
  assert.ok(!groupsFor("buyer").some((g) => g.key === "stock"));
  assert.ok(groupsFor("seller").some((g) => g.key === "stock"));
  assert.ok(!groupsFor("seller").some((g) => g.key === "deals"));
});

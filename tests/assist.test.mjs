import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSIST_SECONDS, readAssistToken, signAssist } from "../lib/assist/token.ts";
import {
  ASSIST_REASON_MAX,
  actorOf,
  assistedSellerOf,
  auditActor,
  cleanAssistReason,
} from "../lib/assist/rules.ts";

// An admin assisting a seller (lib/assist): the cookie that says so, and who
// the audit log names while it lasts.

const SECRET = "test-secret";
const AUTH = "6f1c2d3e-0000-4000-8000-000000000001";
const NOW = 1_800_000_000;
const grant = { adminId: 3, sellerId: 27, until: NOW + ASSIST_SECONDS };

test("a signed grant reads back for the sign-in it was made for", () => {
  const value = signAssist(SECRET, AUTH, grant);
  assert.deepEqual(readAssistToken(SECRET, AUTH, value, NOW), grant);
  assert.deepEqual(readAssistToken(SECRET, AUTH, value, NOW + ASSIST_SECONDS - 1), grant);
});

test("it does nothing for another sign-in, another key, or once changed", () => {
  const value = signAssist(SECRET, AUTH, grant);
  assert.equal(readAssistToken(SECRET, "someone-else", value, NOW), null);
  assert.equal(readAssistToken("other-key", AUTH, value, NOW), null);
  assert.equal(readAssistToken("", AUTH, value, NOW), null);
  // Another seller, admin or end time under the same signature.
  assert.equal(readAssistToken(SECRET, AUTH, value.replace("v1.3.27.", "v1.3.28."), NOW), null);
  assert.equal(readAssistToken(SECRET, AUTH, value.replace("v1.3.27.", "v1.4.27."), NOW), null);
  const later = value.replace(`.${grant.until}.`, `.${grant.until + 60}.`);
  assert.equal(readAssistToken(SECRET, AUTH, later, NOW), null);
});

test("it ends on time and cannot be made to last longer than one session", () => {
  const value = signAssist(SECRET, AUTH, grant);
  assert.equal(readAssistToken(SECRET, AUTH, value, grant.until), null);
  assert.equal(readAssistToken(SECRET, AUTH, value, grant.until + 1), null);
  // Signed correctly, but for longer than a session can last.
  const far = { ...grant, until: NOW + ASSIST_SECONDS + 3600 };
  assert.equal(readAssistToken(SECRET, AUTH, signAssist(SECRET, AUTH, far), NOW), null);
});

test("malformed values and a seller who is the admin read as nothing", () => {
  for (const bad of [undefined, null, "", "v1", "v2.3.27.1.abc", "v1.3.27.x.abc", `v1.3.27.${grant.until}.XYZ`]) {
    assert.equal(readAssistToken(SECRET, AUTH, bad, NOW), null, String(bad));
  }
  const self = { adminId: 3, sellerId: 3, until: grant.until };
  assert.equal(readAssistToken(SECRET, AUTH, signAssist(SECRET, AUTH, self), NOW), null);
});

const seller = { user_id: 27, role: "seller", email: "s@example.test", name: "Maria" };
const assisted = { ...seller, assistedBy: { user_id: 3, name: "Ana", until: "2026-11-25T08:00:00.000Z" } };

test("the audit log names the assisting admin, for the seller", () => {
  assert.deepEqual(actorOf(seller), { user_id: 27, role: "seller" });
  assert.deepEqual(actorOf(assisted), { user_id: 3, role: "admin" });

  assert.deepEqual(auditActor(seller, "product:5"), { actor_id: 27, actor_role: "seller", target: "product:5" });
  assert.deepEqual(auditActor(assisted, "product:5"), {
    actor_id: 3,
    actor_role: "admin",
    target: "product:5 for seller:27",
  });
  assert.deepEqual(auditActor(assisted, null), { actor_id: 3, actor_role: "admin", target: "for seller:27" });

  assert.equal(assistedSellerOf(auditActor(assisted, "order:9").target), 27);
  assert.equal(assistedSellerOf("for seller:27"), 27);
  assert.equal(assistedSellerOf("product:5"), null);
  assert.equal(assistedSellerOf("seller:27 reason:for seller:12 help"), null);
  assert.equal(assistedSellerOf(null), null);
});

test("an admin says why, in one line of 10 to 300 characters", () => {
  assert.equal(cleanAssistReason("  Asked for help\n adding   products  "), "Asked for help adding products");
  assert.equal(cleanAssistReason("too short"), null);
  assert.equal(cleanAssistReason("x".repeat(ASSIST_REASON_MAX + 1)), null);
  assert.equal(cleanAssistReason("x".repeat(ASSIST_REASON_MAX)), "x".repeat(ASSIST_REASON_MAX));
  assert.equal(cleanAssistReason(42), null);
  assert.equal(cleanAssistReason(undefined), null);
});

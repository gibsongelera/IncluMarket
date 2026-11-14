// Tests run on Node's built-in runner (node --test). Node strips TypeScript
// types on import, so pure modules under lib/ are imported directly by their
// .ts path. A module tested here must not import anything at runtime except
// other pure modules: `import type` is fine (it is erased), but `@/` aliases,
// "server-only" and supabase are not resolvable outside Next.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDate, formatDateTime, initials, maskEmail, moneyWhole } from "../lib/format.ts";

test("moneyWhole rounds to whole pesos for a KPI tile", () => {
  assert.equal(moneyWhole(128430.4), "₱128,430");
  assert.equal(moneyWhole("1284300.50"), "₱1,284,301");
  assert.equal(moneyWhole(0), "₱0");
  assert.equal(moneyWhole(null), "₱0");
  assert.equal(moneyWhole("not a number"), "₱0");
});

test("maskEmail keeps first/last letter and the TLD", () => {
  assert.equal(maskEmail("juana@mail.ph"), "j***a@m***.ph");
  assert.equal(maskEmail("ab@x.com"), "a*@x*.com");
  assert.equal(maskEmail(""), "");
  assert.equal(maskEmail("not-an-email"), "not-an-email");
});

test("initials takes at most two words", () => {
  assert.equal(initials("Maria Clara Santos"), "MC");
  assert.equal(initials("ana"), "A");
});

import { addressLine, cleanAddress, cleanPhone } from "../lib/address.ts";

test("delivery addresses: valid input is cleaned, problems name the field", () => {
  const ok = cleanAddress({ recipient: "  Maria   Santos ", phone: "0917 123 4567", line1: "Purok 3, Rizal St.", barangay: "Tetuan", city: "Zamboanga City", postalCode: "7000" });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.recipient, "Maria Santos");
  assert.equal(ok.value.phone, "09171234567");
  assert.equal(addressLine(ok.value), "Purok 3, Rizal St., Brgy. Tetuan, 7000");
  assert.equal(cleanAddress({ recipient: "Maria", phone: "12345", line1: "x street", city: "Zambo" }).field, "phone");
  assert.equal(cleanAddress({ recipient: "Maria", phone: "+639171234567", line1: "x street", city: "Zambo", postalCode: "70" }).field, "postalCode");
  assert.equal(cleanPhone("(0917) 123-4567"), "09171234567");
});

test("dates are Manila dates, wherever the code runs", () => {
  // 23:30 UTC on the 9th is 07:30 on the 10th in Manila.
  assert.match(formatDate("2026-11-09T23:30:00Z"), /10/);
  assert.match(formatDateTime("2026-11-09T23:30:00Z"), /07:30/);
  assert.equal(formatDate(null), "");
});

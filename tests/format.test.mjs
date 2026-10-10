// Tests run on Node's built-in runner (node --test). Node strips TypeScript
// types on import, so pure modules under lib/ are imported directly by their
// .ts path. A module tested here must not import anything at runtime except
// other pure modules: `import type` is fine (it is erased), but `@/` aliases,
// "server-only" and supabase are not resolvable outside Next.
import { test } from "node:test";
import assert from "node:assert/strict";
import { maskEmail, initials } from "../lib/format.ts";

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

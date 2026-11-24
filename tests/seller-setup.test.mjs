import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSellerSetup, firstErrorField } from "../lib/seller-setup.ts";
import { PH_PHONE_RE, cleanPhone } from "../lib/address.ts";
import { checkExpiry, cleanLgu, idLast4, normalizePwdIdNumber } from "../lib/pwd/id-number.ts";

// The same wiring as lib/seller-setup-rules.ts, with "today" fixed.
const TODAY = "2026-11-24";
const deps = {
  normalizePwdIdNumber,
  idLast4,
  cleanLgu,
  checkExpiry: (iso) => checkExpiry(iso, TODAY),
  manilaToday: () => TODAY,
  cleanPhone,
  phonePattern: PH_PHONE_RE,
};

const good = {
  name: "  Juana   Dela Cruz ",
  email: " Juana.DelaCruz@Example.com ",
  phone: "0917 123 4567",
  disability: "Visual impairment",
  needs: "Screen reader",
  idNumber: "0973170000001234",
  lgu: "Zamboanga City PDAO",
  expiresOn: "2029-06-30",
  seenNote: "Seen at AVRC on 24 Nov",
  shopName: "Juana's Bags",
  city: "Zamboanga City",
  story: "I weave bags.\r\n\r\n\r\nEach one takes a week.",
  consent: true,
};

test("a complete seller set-up is tidied the way it is saved", () => {
  const r = checkSellerSetup(good, deps);
  assert.equal(r.ok, true);
  assert.equal(r.value.name, "Juana Dela Cruz");
  assert.equal(r.value.email, "juana.delacruz@example.com");
  assert.equal(r.value.phone, "09171234567");
  assert.equal(r.value.idNumber, "09-7317-000-0001234");
  assert.equal(r.value.idLast4, "1234");
  assert.equal(r.value.story, "I weave bags.\n\nEach one takes a week.");
  assert.equal(r.value.city, "Zamboanga City");
});

test("the optional fields may be left empty", () => {
  const r = checkSellerSetup({ ...good, needs: " ", city: "", story: "" }, deps);
  assert.equal(r.ok, true);
  assert.equal(r.value.needs, null);
  assert.equal(r.value.city, null);
  assert.equal(r.value.story, null);
});

test("every required field says what is wrong, and focus goes to the first", () => {
  const r = checkSellerSetup({}, deps);
  assert.equal(r.ok, false);
  for (const f of ["name", "email", "phone", "disability", "idNumber", "lgu", "expiresOn", "seenNote", "shopName", "consent"]) {
    assert.ok(r.errors[f], `${f} should have an error`);
  }
  assert.equal(r.errors.needs, undefined);
  assert.equal(r.errors.city, undefined);
  assert.equal(firstErrorField(r.errors), "name");
  assert.equal(firstErrorField({ shopName: "x", phone: "y" }), "phone");
});

test("an expired, impossible or far-off ID date is refused in words for staff", () => {
  assert.match(checkSellerSetup({ ...good, expiresOn: TODAY }, deps).errors.expiresOn, /expired/);
  assert.match(checkSellerSetup({ ...good, expiresOn: "2027-02-30" }, deps).errors.expiresOn, /expiry date printed/);
  assert.match(checkSellerSetup({ ...good, expiresOn: "2040-01-01" }, deps).errors.expiresOn, /further away/);
});

test("a wrong ID number, phone or email is refused", () => {
  const r = checkSellerSetup({ ...good, idNumber: "1234", phone: "12345", email: "juana@" }, deps);
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ["email", "idNumber", "phone"]);
});

test("consent has to be given, not just present", () => {
  assert.ok(checkSellerSetup({ ...good, consent: "true" }, deps).errors.consent);
  assert.ok(checkSellerSetup({ ...good, consent: false }, deps).errors.consent);
});

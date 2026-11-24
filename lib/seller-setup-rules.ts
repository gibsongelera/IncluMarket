import { PH_PHONE_RE, cleanPhone } from "./address";
import { checkExpiry, cleanLgu, idLast4, manilaToday, normalizePwdIdNumber } from "./pwd/id-number";
import type { SellerRuleDeps } from "./seller-setup";

/**
 * The PWD ID and phone rules the seller set-up check uses: the same ones
 * the verification form, the address book and the database apply. Safe in
 * the browser (both modules are pure), so the form and the server action
 * check with one set.
 */
export const SELLER_RULES: SellerRuleDeps = {
  normalizePwdIdNumber,
  idLast4,
  cleanLgu,
  checkExpiry: (iso) => checkExpiry(iso),
  manilaToday: () => manilaToday(),
  cleanPhone,
  phonePattern: PH_PHONE_RE,
};

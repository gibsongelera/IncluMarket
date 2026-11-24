/**
 * Setting up a PWD seller (Admin → Users → Set up a seller): the details
 * AVRC staff take from the person and from their PWD ID card, and the one
 * check that the form and the server action both run.
 *
 * Pure, with no imports. The PWD ID and phone rules come in as `deps`
 * (lib/seller-setup-rules.ts passes lib/pwd/id-number.ts and
 * lib/address.ts), so the tests can load this file directly.
 */

export type SellerSetupField =
  | "name"
  | "email"
  | "phone"
  | "disability"
  | "needs"
  | "idNumber"
  | "lgu"
  | "expiresOn"
  | "seenNote"
  | "shopName"
  | "city"
  | "story"
  | "consent";

/** Form order: focus goes to the first field with an error. */
export const SELLER_SETUP_ORDER: readonly SellerSetupField[] = [
  "name",
  "email",
  "phone",
  "disability",
  "needs",
  "idNumber",
  "lgu",
  "expiresOn",
  "seenNote",
  "shopName",
  "city",
  "story",
  "consent",
];

export interface SellerSetupInput {
  name: string;
  email: string;
  phone: string;
  disability: string;
  needs: string;
  idNumber: string;
  lgu: string;
  expiresOn: string;
  seenNote: string;
  shopName: string;
  city: string;
  story: string;
  consent: boolean;
}

/** The checked details, ready to save. */
export interface SellerSetup {
  name: string;
  email: string;
  phone: string;
  disability: string;
  needs: string | null;
  /** National format, RR-PPMM-BBB-NNNNNNN. */
  idNumber: string;
  idLast4: string;
  lgu: string;
  expiresOn: string;
  seenNote: string;
  shopName: string;
  city: string | null;
  story: string | null;
}

export type SellerSetupErrors = Partial<Record<SellerSetupField, string>>;

/** Longest value per field; the database holds the same limits (0019, 0017). */
export const SELLER_SETUP_MAX = {
  name: 120,
  email: 254,
  disability: 120,
  needs: 200,
  lgu: 120,
  seenNote: 500,
  shopName: 80,
  city: 80,
  story: 1000,
} as const;

/** What the check borrows from the PWD ID and address rules. */
export interface SellerRuleDeps {
  normalizePwdIdNumber(raw: string): string | null;
  idLast4(normalized: string): string;
  cleanLgu(raw: string): { ok: true; value: string } | { ok: false; error: string };
  checkExpiry(iso: string): { ok: true } | { ok: false; error: string };
  manilaToday(): string;
  cleanPhone(raw: unknown): string;
  phonePattern: RegExp;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One line: spaces collapsed, ends trimmed. */
function line(v: unknown): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A paragraph or two: line breaks kept, runs of spaces and blank lines collapsed. */
function prose(v: unknown): string {
  return String(v ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A real calendar date written YYYY-MM-DD (no 30 February). */
function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function checkSellerSetup(
  raw: Partial<SellerSetupInput>,
  deps: SellerRuleDeps
): { ok: true; value: SellerSetup } | { ok: false; errors: SellerSetupErrors } {
  const errors: SellerSetupErrors = {};

  const name = line(raw.name);
  if (name.length < 2 || name.length > SELLER_SETUP_MAX.name) {
    errors.name = "Enter the seller's full name, as it is on their PWD ID.";
  }

  const email = line(raw.email).toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > SELLER_SETUP_MAX.email) {
    errors.email = "Enter an email address that the seller, or someone who helps them, can open.";
  }

  const phone = deps.cleanPhone(raw.phone);
  if (!deps.phonePattern.test(phone)) {
    errors.phone = "Enter a Philippine mobile number, for example 0917 123 4567.";
  }

  const disability = line(raw.disability);
  if (disability.length < 2 || disability.length > SELLER_SETUP_MAX.disability) {
    errors.disability = "Enter the disability, as it is written on the PWD ID.";
  }

  const needs = line(raw.needs);
  if (needs.length > SELLER_SETUP_MAX.needs) errors.needs = "Keep this under 200 characters.";

  const idNumber = deps.normalizePwdIdNumber(String(raw.idNumber ?? ""));
  if (!idNumber) errors.idNumber = "Enter the 16-digit PWD ID number from the card.";

  const lgu = deps.cleanLgu(String(raw.lgu ?? ""));
  if (!lgu.ok) errors.lgu = "Enter the office that issued the ID, for example Zamboanga City PDAO.";

  const expiresOn = String(raw.expiresOn ?? "").trim();
  if (!isRealDate(expiresOn)) {
    errors.expiresOn = "Enter the expiry date printed on the ID.";
  } else if (expiresOn <= deps.manilaToday()) {
    errors.expiresOn = "This ID has expired. The seller needs a renewed ID from their PDAO first.";
  } else {
    const expiry = deps.checkExpiry(expiresOn);
    if (!expiry.ok) errors.expiresOn = expiry.error;
  }

  const seenNote = line(raw.seenNote);
  if (seenNote.length < 10 || seenNote.length > SELLER_SETUP_MAX.seenNote) {
    errors.seenNote = "Say where and when you saw the card, for example “Seen at AVRC on 12 Oct”.";
  }

  const shopName = line(raw.shopName);
  if (shopName.length < 2 || shopName.length > SELLER_SETUP_MAX.shopName) {
    errors.shopName = "A shop name is 2 to 80 characters.";
  }

  const city = line(raw.city);
  if (city.length > SELLER_SETUP_MAX.city) errors.city = "Keep the town or city under 80 characters.";

  const story = prose(raw.story);
  if (story.length > SELLER_SETUP_MAX.story) errors.story = "Keep the story under 1,000 characters.";

  if (raw.consent !== true) {
    errors.consent = "Confirm that the seller agreed to InclusiveMarket keeping these details.";
  }

  if (Object.keys(errors).length > 0 || !idNumber || !lgu.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      email,
      phone,
      disability,
      needs: needs || null,
      idNumber,
      idLast4: deps.idLast4(idNumber),
      lgu: lgu.value,
      expiresOn,
      seenNote,
      shopName,
      city: city || null,
      story: story || null,
    },
  };
}

/** The first field with an error, in form order. */
export function firstErrorField(errors: SellerSetupErrors): SellerSetupField | null {
  return SELLER_SETUP_ORDER.find((f) => errors[f]) ?? null;
}

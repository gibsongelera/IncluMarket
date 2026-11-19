/**
 * Delivery addresses (im_addresses, migration 0019): one set of rules for
 * the checkout form, the address book and the server actions. Pure — the
 * same checks the database constraints make, with messages a person can act
 * on.
 */

export const PH_PHONE_RE = /^(?:\+?63|0)\d{9,10}$/;

export function cleanPhone(input: unknown): string {
  return String(input ?? "").replace(/[\s()-]/g, "");
}

export interface AddressFields {
  label: string | null;
  recipient: string;
  phone: string;
  line1: string;
  barangay: string | null;
  city: string;
  province: string | null;
  postalCode: string | null;
}

/** An address as pages and forms see it (the person's own data). */
export interface AddressLite extends AddressFields {
  id: number;
  isDefault: boolean;
}

export type AddressField = keyof AddressFields;

function text(v: unknown, max: number): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function cleanAddress(
  input: Partial<Record<AddressField, unknown>>
): { ok: true; value: AddressFields } | { ok: false; error: string; field: AddressField } {
  const recipient = text(input.recipient, 120);
  if (recipient.length < 2) return { ok: false, field: "recipient", error: "Enter the full name of the person receiving the parcel." };
  const phone = cleanPhone(input.phone);
  if (!PH_PHONE_RE.test(phone)) {
    return { ok: false, field: "phone", error: "Enter a Philippine mobile or landline number, for example 09171234567." };
  }
  const line1 = text(input.line1, 300);
  if (line1.length < 3) return { ok: false, field: "line1", error: "Enter the house number and street." };
  const city = text(input.city, 80);
  if (city.length < 2) return { ok: false, field: "city", error: "Enter the city or municipality." };
  const postal = text(input.postalCode, 4);
  if (postal && !/^\d{4}$/.test(postal)) return { ok: false, field: "postalCode", error: "A ZIP code has 4 digits, for example 7000." };
  return {
    ok: true,
    value: {
      label: text(input.label, 40) || null,
      recipient,
      phone,
      line1,
      barangay: text(input.barangay, 120) || null,
      city,
      province: text(input.province, 80) || null,
      postalCode: postal || null,
    },
  };
}

/** The street part of an order's shipping address (the city is stored apart). */
export function addressLine(a: Pick<AddressFields, "line1" | "barangay" | "province" | "postalCode">): string {
  return [a.line1, a.barangay ? `Brgy. ${a.barangay.replace(/^brgy\.?\s*/i, "")}` : null, a.province, a.postalCode]
    .filter(Boolean)
    .join(", ");
}

/** One line for lists: "Maria Santos · Purok 3, Brgy. Tetuan, Zamboanga City". */
export function addressSummary(a: AddressFields): string {
  return `${a.recipient} · ${addressLine(a)}, ${a.city}`;
}

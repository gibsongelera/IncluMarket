/**
 * PWD ID rules shared by the form (browser), the server action and the tests.
 * Pure: no imports, no secrets. Hashing and encryption live in crypto.ts,
 * which is server-only.
 */

/**
 * National format RR-PPMM-BBB-NNNNNNN: region, province + municipality,
 * barangay, sequence. Region IX is 09.
 */
export const PWD_ID_PATTERN = /^\d{2}-\d{4}-\d{3}-\d{7}$/;
export const PWD_ID_EXAMPLE = "09-7317-000-0001234";

/** DOH Philippine Registry for PWD. No API: the admin pastes the number. */
export const DOH_REGISTRY_URL = "https://pwd.doh.gov.ph/tbl_pwd_id_verificationlist.php";

/** Longest validity we accept. PWD IDs are issued for three to five years. */
export const MAX_VALID_YEARS = 10;

/**
 * Accepts the number as printed, with or without dashes or spaces, and
 * returns it in the national format — or null when it cannot be one.
 */
export function normalizePwdIdNumber(raw: string): string | null {
  const compact = String(raw ?? "").replace(/[\s‐-―]/g, "").replace(/-/g, "");
  if (!/^\d{16}$/.test(compact)) return null;
  const formatted = `${compact.slice(0, 2)}-${compact.slice(2, 6)}-${compact.slice(6, 9)}-${compact.slice(9)}`;
  return PWD_ID_PATTERN.test(formatted) ? formatted : null;
}

export function idLast4(normalized: string): string {
  return normalized.replace(/\D/g, "").slice(-4);
}

/** What anyone but the reviewing admin sees: the last four digits only. */
export function maskPwdId(last4: string | null | undefined): string {
  return last4 && /^\d{4}$/.test(last4) ? `••-••••-•••-•••${last4}` : "••-••••-•••-•••••••";
}

/** Today's date in the Philippines as YYYY-MM-DD (the server may run in UTC). */
export function manilaToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(y + years).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** An expired ID is refused; so is a date no real ID could carry. */
export function checkExpiry(iso: string, today: string = manilaToday()): { ok: true } | { ok: false; error: string } {
  if (!isRealDate(iso)) return { ok: false, error: "Enter the expiry date printed on your ID." };
  if (iso <= today) {
    return {
      ok: false,
      error: "This ID has expired. Renew it at your city or municipal PDAO, then submit the new ID.",
    };
  }
  if (iso > addYears(today, MAX_VALID_YEARS)) {
    return { ok: false, error: "Check the expiry date — it is further away than any PWD ID is valid." };
  }
  return { ok: true };
}

/** Days from `today` until `iso` (both YYYY-MM-DD). Negative once past. */
export function daysUntil(iso: string, today: string = manilaToday()): number {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${iso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function cleanLgu(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (value.length < 3) {
    return { ok: false, error: "Enter the city or municipality that issued your ID (for example, Zamboanga City PDAO)." };
  }
  if (value.length > 120) return { ok: false, error: "Keep the issuing office under 120 characters." };
  return { ok: true, value };
}

/** Reasons an admin can pick when rejecting. The user sees the label. */
export const REJECT_REASONS = [
  { code: "unreadable", label: "The photos are blurry or cut off" },
  { code: "expired", label: "The ID has expired" },
  { code: "mismatch", label: "The details do not match the ID" },
  { code: "selfie", label: "The selfie does not clearly show you holding the ID" },
  { code: "not_pwd_id", label: "This is not a PWD ID" },
  { code: "registry", label: "We could not confirm the ID with the issuing office" },
  { code: "other", label: "Another reason (explained below)" },
] as const;

export type RejectReasonCode = (typeof REJECT_REASONS)[number]["code"];

export function rejectReasonLabel(code: string | null | undefined): string {
  return REJECT_REASONS.find((r) => r.code === code)?.label ?? "Another reason";
}

export type VerificationStatus = "submitted" | "approved" | "rejected" | "expired" | "revoked";

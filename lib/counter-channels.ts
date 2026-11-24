/**
 * Paying the Workshop over the counter (migration 0028): the channels, and
 * the shape of what an admin or a buyer may type. Pure — the checkout, the
 * pay page, Admin → Payments and the server actions share it, and the
 * database checks the same shapes again. Tested by tests/counter-channels.test.mjs.
 */

export type CounterChannel = "gcash" | "maribank" | "lbp";

export const COUNTER_CHANNELS: { id: CounterChannel; label: string; hint: string }[] = [
  { id: "gcash", label: "GCash", hint: "Send Money in the GCash app, or cash in at a GCash outlet." },
  { id: "maribank", label: "Maribank", hint: "Transfer in the Maribank app." },
  { id: "lbp", label: "LandBank (LBP)", hint: "Deposit at a LandBank branch, or transfer in the LANDBANK app." },
];

export function isCounterChannel(v: unknown): v is CounterChannel {
  return v === "gcash" || v === "maribank" || v === "lbp";
}

export function channelLabel(v: string | null | undefined): string {
  return COUNTER_CHANNELS.find((c) => c.id === v)?.label ?? "the Workshop";
}

/** A reference number as the database keeps it: letters, digits and dashes. */
export function cleanReference(input: unknown): string | null {
  const v = String(input ?? "").trim().replace(/\s+/g, "");
  return /^[0-9A-Za-z-]{4,40}$/.test(v) ? v : null;
}

/** An account number as shown to buyers: digits, letters, spaces, dashes. */
export function cleanAccountNumber(input: unknown): string | null {
  const v = String(input ?? "").trim().replace(/\s+/g, " ");
  return /^[0-9A-Za-z -]{4,40}$/.test(v) ? v : null;
}

/** Pesos typed by a buyer ("1,250.50", "₱ 350"), or null. */
export function cleanAmount(input: unknown): number | null {
  const v = String(input ?? "").replace(/[₱,\s]/g, "");
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(v)) return null;
  const n = Number(v);
  return n > 0 && n <= 10_000_000 ? Math.round(n * 100) / 100 : null;
}

/** When an unpaid counter order is released: its time plus the hold. */
export function payBy(placedAt: string, holdHours: number): Date {
  return new Date(new Date(placedAt).getTime() + holdHours * 3_600_000);
}

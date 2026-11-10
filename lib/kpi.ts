/**
 * The words and colour of a KPI card's trend line (01 §6.1, 03 §4), shared
 * by every dashboard so the admin and seller figures read the same way.
 *
 * Pure: no runtime imports, so tests/kpi.test.mjs imports it by its .ts path
 * (see the header of tests/format.test.mjs).
 */

/** The direction that is good news: "up" for sales, "down" for a return rate. */
export type KpiGood = "up" | "down";

/** A trend is coloured by good or bad news, not by up or down. */
export type KpiTrendTone = "good" | "bad" | "neutral";

export type KpiTrend =
  /** A figure is missing or not a finite number: the card shows no trend line. */
  | { kind: "none" }
  /** Nothing in the previous period, so a percentage would mean nothing. */
  | { kind: "new"; tone: "neutral"; words: string }
  /** The change rounds to 0.0%, or both periods are 0. */
  | { kind: "flat"; tone: "neutral"; words: string }
  /** `pct` is the signed change to one decimal: -12.5 for a fall of 12.5%. */
  | { kind: "up" | "down"; tone: "good" | "bad"; pct: number; words: string };

/** One decimal with en-PH grouping: 18.2, 4,900.0. */
const ONE_DECIMAL = { minimumFractionDigits: 1, maximumFractionDigits: 1 } as const;

/**
 * x to one decimal, half away from zero, judged on its decimal form, so that
 * 1.15 gives 1.2 and -99.75 gives -99.8. toFixed() gives 1.1 (the double is
 * 1.1499...), and Math.round(x * 10) / 10 gives -99.7 (it rounds halves up,
 * towards +Infinity, so a fall and a rise of the same size would differ).
 */
function roundOneDecimal(x: number): number {
  // Twelve significant digits drop the noise of the arithmetic before it:
  // (100.05 - 100) * 100 / 100 is 0.04999999999999716, meant as 0.05.
  const abs = Math.abs(Number(x.toPrecision(12)));
  if (abs < 0.05) return 0; // also keeps exponent forms (1e-7) out of the shift below
  if (abs >= 1e15) return Math.sign(x) * Math.round(abs); // no decimal left to round
  const rounded = Number(`${Math.round(Number(`${abs}e1`))}e-1`);
  return x < 0 ? -rounded : rounded;
}

/**
 * The trend of a figure against the period before: "up 18.2% vs previous 30
 * days". The tone follows `good`: with good "down", a falling return rate is
 * good news. The card always shows the words and an arrow, never the colour
 * alone.
 *
 * - current or previous null, undefined, NaN or infinite: none.
 * - previous 0: flat when current is 0 too, otherwise "New".
 * - otherwise the change over |previous| (so a negative previous still reads
 *   the right way round), to one decimal; a change that rounds to 0.0% is flat.
 */
export function kpiTrend(
  current: number | null | undefined,
  previous: number | null | undefined,
  good: KpiGood,
  period = "previous 30 days"
): KpiTrend {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return { kind: "none" };
  }
  const flat: KpiTrend = { kind: "flat", tone: "neutral", words: `no change vs ${period}` };
  if (previous === 0) {
    return current === 0 ? flat : { kind: "new", tone: "neutral", words: `New (none in the ${period})` };
  }
  // Multiplied before dividing, so whole numbers stay exact: 2300 / 2000 is
  // 1.15, where 23 / 2000 * 100 needs the rounding above to clean it up.
  const pct = roundOneDecimal(((current - previous) * 100) / Math.abs(previous));
  if (pct === 0) return flat;
  const kind: "up" | "down" = pct > 0 ? "up" : "down";
  return {
    kind,
    tone: kind === good ? "good" : "bad",
    pct,
    words: `${kind} ${Math.abs(pct).toLocaleString("en-PH", ONE_DECIMAL)}% vs ${period}`,
  };
}

/**
 * A sparkline in words, for screen readers: "Daily sales, lowest ₱0,
 * highest ₱6,000". Values that are not finite numbers are skipped; with
 * none left it says "Daily sales: no data yet".
 */
export function rangeSummary(
  label: string,
  values: readonly (number | null | undefined)[],
  format: (n: number) => string
): string {
  let lowest = Infinity;
  let highest = -Infinity;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    if (v < lowest) lowest = v;
    if (v > highest) highest = v;
  }
  if (lowest === Infinity) return `${label}: no data yet`;
  return `${label}, lowest ${format(lowest)}, highest ${format(highest)}`;
}

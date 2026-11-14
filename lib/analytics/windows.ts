/**
 * Asia/Manila calendar days for the dashboards (03 §4). The Philippines keeps
 * UTC+8 all year (no daylight saving), so a Manila day is computed from the
 * UTC epoch with a fixed offset, never from the server's local time: the
 * server runs in UTC, where setHours(0, 0, 0, 0) starts a Manila day at 08:00.
 *
 * Every function takes `now` (or an instant) as an argument, so tests are
 * deterministic. Instants are epoch milliseconds; ranges are [start, end).
 * Pure, with no runtime imports: tests import this file by its .ts path, and
 * lib/analytics/aggregate.ts takes these ranges as arguments rather than
 * importing it.
 */

export const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
/** Days in a dashboard window: the 30 days ending with today (03 §4). */
export const WINDOW_DAYS = 30;
/** Days in a week block. */
export const WEEK_DAYS = 7;

/** A span of time, [start, end) in epoch milliseconds. */
export interface Range {
  start: number;
  end: number;
}

/** One Manila day: "YYYY-MM-DD" and its span. */
export interface DayRange extends Range {
  day: string;
}

/** Epoch milliseconds of a Date, a number or an ISO string; NaN when it is not a time. */
export function toMs(at: Date | number | string): number {
  if (at instanceof Date) return at.getTime();
  if (typeof at === "number") return at;
  return Date.parse(at);
}

/** The instant the Manila day holding `at` begins. NaN for an invalid time. */
export function manilaDayStart(at: Date | number | string): number {
  const t = toMs(at);
  if (!Number.isFinite(t)) return Number.NaN;
  return Math.floor((t + MANILA_OFFSET_MS) / DAY_MS) * DAY_MS - MANILA_OFFSET_MS;
}

/** The Manila day holding `at`, as "YYYY-MM-DD"; "" for an invalid time. */
export function manilaDayKey(at: Date | number | string): string {
  const start = manilaDayStart(at);
  if (!Number.isFinite(start)) return "";
  // Shifted by the offset, the UTC fields of the day's start are Manila's.
  return new Date(start + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** The days of a range that starts on a Manila midnight, oldest first. */
export function dayRanges(range: Range): DayRange[] {
  const out: DayRange[] = [];
  for (let start = range.start; start < range.end; start += DAY_MS) {
    out.push({ day: manilaDayKey(start), start, end: Math.min(start + DAY_MS, range.end) });
  }
  return out;
}

/**
 * The current window, the `days` Manila days ending with today (today is
 * partial: it ends at the coming midnight), and the previous window, the
 * `days` before it. They meet without a gap or an overlap.
 */
export function windows(now: Date | number | string, days: number = WINDOW_DAYS): { current: Range; previous: Range } {
  const n = Math.max(1, Math.floor(days));
  const end = manilaDayStart(now) + DAY_MS;
  const start = end - n * DAY_MS;
  return { current: { start, end }, previous: { start: start - n * DAY_MS, end: start } };
}

/**
 * `count` blocks of seven Manila days, oldest first, the last ending with
 * today; each with its first and last day ("YYYY-MM-DD") for labels.
 */
export function weekBlocks(
  now: Date | number | string,
  count: number
): (Range & { firstDay: string; lastDay: string })[] {
  const n = Math.max(0, Math.floor(count));
  const end = manilaDayStart(now) + DAY_MS;
  const out: (Range & { firstDay: string; lastDay: string })[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const blockEnd = end - i * WEEK_DAYS * DAY_MS;
    const blockStart = blockEnd - WEEK_DAYS * DAY_MS;
    out.push({
      start: blockStart,
      end: blockEnd,
      firstDay: manilaDayKey(blockStart),
      lastDay: manilaDayKey(blockEnd - DAY_MS),
    });
  }
  return out;
}

/** Whether an instant falls in a range; false for an invalid time. */
export function inRange(at: Date | number | string | null | undefined, range: Range): boolean {
  if (at === null || at === undefined) return false;
  const t = toMs(at);
  return Number.isFinite(t) && t >= range.start && t < range.end;
}

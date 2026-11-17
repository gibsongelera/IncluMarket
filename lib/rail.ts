/**
 * Where a RailScroller's track is scrolled to (P4-02, ADR-06), from the three
 * numbers the browser gives: scrollLeft, scrollWidth and clientWidth. Pure,
 * so the ends and the hero's "2 of 4" are unit-tested without a browser
 * (tests/rail.test.mjs).
 *
 * Sub-pixel layout rounds scrollLeft and scrollWidth differently (a 3-up rail
 * 1,000.5px wide stops at 999.5 of 1,000), so every comparison allows 1px.
 * Left to right only, as the storefront is; an overscroll bounce (Safari
 * reports a negative scrollLeft) counts as the start.
 */

export const RAIL_TOLERANCE_PX = 1;

export interface RailMetrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

export interface RailPosition {
  /** More content than one view: the buttons are worth showing. */
  overflow: boolean;
  atStart: boolean;
  atEnd: boolean;
  /** Zero-based view under the left edge (the hero shows index + 1 "of n"). */
  index: number;
}

export function railPosition(m: RailMetrics, count: number): RailPosition {
  const max = Math.max(0, m.scrollWidth - m.clientWidth);
  const left = Math.min(max, Math.max(0, m.scrollLeft));
  const overflow = max > RAIL_TOLERANCE_PX;
  const atStart = !overflow || left <= RAIL_TOLERANCE_PX;
  const atEnd = !overflow || left >= max - RAIL_TOLERANCE_PX;
  const view = m.clientWidth > 0 ? Math.round(left / m.clientWidth) : 0;
  const index = count > 0 ? Math.min(count - 1, Math.max(0, view)) : 0;
  return { overflow, atStart, atEnd, index };
}

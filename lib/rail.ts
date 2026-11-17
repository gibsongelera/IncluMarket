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

/** An item's edges, in px from the start of the view (negative: left of it). */
export interface ItemSpan {
  start: number;
  end: number;
}

/**
 * How far Previous / Next scroll, so every view starts on a whole item
 * (P4-04: fixed-width category tiles do not divide a view evenly, and
 * paging by the view's width skipped a tile that was half in view).
 *
 *   Next      the first item not wholly in view moves to the start.
 *   Previous  the item cut off on the left becomes the last one wholly in
 *             view, starting the view on the earliest item that allows it.
 *
 * `viewWidth` is the visible content width (the track's clientWidth less
 * its scroll padding). Returns null when there is nothing further that way.
 * Where cards divide the view exactly (the product rails, the hero) this is
 * the view's width plus one gap, the same as paging by clientWidth.
 */
export function pageDelta(items: readonly ItemSpan[], viewWidth: number, direction: -1 | 1): number | null {
  const tol = RAIL_TOLERANCE_PX;
  if (direction > 0) {
    const next = items.find((i) => i.end > viewWidth + tol);
    if (!next) return null;
    // An item wider than the view whose start is already in view: page by the view.
    return next.start > tol ? next.start : viewWidth;
  }
  let cut: ItemSpan | undefined;
  for (const i of items) if (i.start < -tol) cut = i;
  if (!cut) return null;
  const first = items.find((i) => i.start >= cut.end - viewWidth - tol);
  return first && first.start < -tol ? first.start : cut.start;
}

"use client";

/**
 * Canvas 2D charts with no library (01 §2.4, §6.2, D-07, ADR-03): a line
 * chart of up to four series, vertical bars, horizontal bars, a donut and
 * the KPI sparkline. components/Chart.tsx and components/Sparkline.tsx draw
 * them. The words are HTML there: a data table for every kind, and the
 * donut's total and legend, so a figure never exists only as pixels.
 *
 * - Colours are tokens read from the computed style, so the eight theme
 *   presets and high contrast decide them. Line series take --chart-1 to
 *   --chart-4 in order; a donut segment takes the colour of its status.
 * - Labels are .875 x the root font, which the accessibility toolbar sets
 *   (14px at the 16px default, 21px at 24px), in the body's face. They are
 *   measured: the left pad fits the widest tick, x labels thin out until
 *   none overlap, and nothing is drawn past an edge.
 *
 * Everything under "Pure" touches no DOM: tests/charts.test.mjs imports this
 * file by its .ts path (see the header of tests/format.test.mjs), so it must
 * not import anything at runtime.
 */

export type Point = {
  label: string;
  value: number;
  /** A donut segment's order status, which picks its colour (STATUS_TOKENS). */
  status?: string;
  /** A token ("var(--x)" or "--x") or a colour; wins over the status and series colours. */
  color?: string;
  /** donut: its legend item links here (the seller's orders in that status). Not drawn. */
  href?: string;
};
export type Series = { points: Point[]; label?: string; color?: string };
export type ChartKind = "line" | "bar" | "hbar" | "donut";
export type DrawOptions = { currency?: boolean; color?: string };

/** Line series colours, in order. One chart shows at most four series (01 §2.4). */
export const SERIES_TOKENS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4"] as const;
export const MAX_SERIES = SERIES_TOKENS.length;
/** A dash pattern per series, so two lines differ by more than colour (WCAG 1.4.1). */
export const SERIES_DASHES: readonly (readonly number[])[] = [[], [6, 4], [2, 3], [8, 3, 2, 3]];

/**
 * Donut segments by order status, not series order (01 §2.3, §2.4): the
 * fixed --status-* tokens and the fixed teal and plum, so a status reads the
 * same in every event theme (high contrast darkens the --status-* ones).
 * Return requested is plum because pending already has the warning colour.
 * Cancelled and any unknown status are neutral. check-contrast.mjs requires
 * each at 3:1 on a card.
 */
export const STATUS_TOKENS: Readonly<Record<string, string>> = {
  pending: "--status-warn",
  processing: "--status-info",
  shipped: "--palette-teal",
  delivered: "--status-ok",
  return_requested: "--palette-plum",
  returned: "--status-error",
  cancelled: "--status-neutral",
};
/** Segments with no status: the chart series in order (all six 3:1 on white). */
const SEGMENT_TOKENS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5", "--chart-6"] as const;

/** Labels: .875 x the root font, the small-print minimum (01 §3.2). */
export const LABEL_EM = 0.875;
/** The donut's hole as a share of its radius. The centre total's padding in components.css keeps inside it. */
export const DONUT_HOLE = 0.62;
/** The card's white between donut segments, in CSS px. */
export const DONUT_GAP = 2;
const LINE_WIDTH = 2;
const ELLIPSIS = "…";

// ---------------------------------------------------------------------------
// Pure
// ---------------------------------------------------------------------------

export function isSeries(data: readonly Point[] | readonly Series[]): data is readonly Series[] {
  return data.length > 0 && "points" in data[0];
}

/** The points of a bar, hbar or donut chart; given series, the first one's. */
export function toPoints(data: readonly Point[] | readonly Series[]): readonly Point[] {
  return isSeries(data) ? (data[0]?.points ?? []) : data;
}

/**
 * A figure as the data table, the legend and the bar ends print it: grouped,
 * and whole pesos with `currency`, like lib/format.ts moneyWhole (both digit
 * limits set, as there).
 */
export function formatValue(value: number, currency?: boolean): string {
  if (!Number.isFinite(value)) return "—";
  return currency
    ? value.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : value.toLocaleString("en-PH");
}

/** An axis tick, short: 2.5k, 150k, 1.2M, with a peso sign for money. */
export function compact(value: number, currency?: boolean): string {
  const a = Math.abs(value);
  const [div, suffix] = a >= 1e6 ? [1e6, "M"] : a >= 1e3 ? [1e3, "k"] : [1, ""];
  const v = value / div;
  // One decimal below 10 of a unit (2.5k), none above (25k); plain figures keep up to two.
  const digits = div === 1 ? 2 : Math.abs(v) < 10 ? 1 : 0;
  return (currency ? "₱" : "") + v.toLocaleString("en-PH", { maximumFractionDigits: digits }) + suffix;
}

/**
 * A rounded value axis: the top tick and the step between ticks, with at
 * most `intervals` steps. Steps are 1, 2, 2.5 or 5 times a power of ten,
 * and whole numbers once the data reaches 1, so counts never get a 2.5
 * tick. An empty or all-zero axis runs 0 to 1.
 */
export function niceScale(max: number, intervals: number): { top: number; step: number } {
  const n = Math.max(1, Math.floor(intervals) || 1);
  const m = Number.isFinite(max) && max > 0 ? max : 0;
  if (m === 0) return { top: 1, step: 1 };
  const raw = m / n;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  let step = 10 * pow;
  for (const f of [1, 2, 2.5, 5, 10]) {
    const s = Number((f * pow).toPrecision(12));
    if (s < raw * (1 - 1e-9)) continue;
    if (m >= 1 && (s < 1 || !Number.isInteger(s))) continue;
    step = s;
    break;
  }
  if (m >= 1) step = Math.max(1, Math.round(step));
  const top = Number((step * Math.ceil(m / step - 1e-9)).toPrecision(12));
  return { top, step };
}

/**
 * Each value's share of the total as the nearest whole percent (a half
 * rounds up), so equal counts always read the same. A legend may then add up
 * to 99% or 101%; forcing 100 (largest remainder) showed two orders as 16%
 * beside two more at 15%. Values that are not positive finite numbers count
 * as 0; all zero gives all zero. A positive share that rounds to 0, or a
 * part that rounds to 100, is the caller's to word ("under 1%", "over 99%").
 */
export function shares(values: readonly number[]): number[] {
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  if (total === 0) return clean.map(() => 0);
  // toPrecision drops float noise, so 12.5 is not 12.4999… and rounds up.
  return clean.map((v) => Math.round(Number(((v * 100) / total).toPrecision(12))));
}

/**
 * The angle of each donut segment, in radians, summing to a full turn. A
 * segment smaller than `minAngle` is widened to it (taken from the larger
 * ones), so the 2px gaps cannot swallow a segment that the legend lists.
 * Zero and invalid values get 0; all zero gives all 0.
 */
export function donutAngles(values: readonly number[], minAngle = 0): number[] {
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  if (total === 0) return clean.map(() => 0);
  const turn = 2 * Math.PI;
  const angles = clean.map((v) => (v / total) * turn);
  const live = angles.filter((a) => a > 0).length;
  const floor = Math.min(Math.max(0, minAngle), turn / Math.max(1, live));
  if (live < 2 || floor === 0) return angles;
  const small = angles.map((a) => a > 0 && a < floor);
  const lift = angles.reduce((n, a, i) => n + (small[i] ? floor - a : 0), 0);
  const big = angles.reduce((n, a, i) => n + (a > 0 && !small[i] ? a : 0), 0);
  if (lift === 0 || big === 0) return angles;
  const k = (big - lift) / big;
  return angles.map((a, i) => (a === 0 ? 0 : small[i] ? floor : a * k));
}

/** `text`, or its longest start that fits `room` with an ellipsis, or "" when not even that fits. */
export function fitText(measure: (text: string) => number, text: string, room: number): string {
  if (measure(text) <= room) return text;
  const chars = Array.from(text); // whole code points, so an emoji is never split
  let lo = 0;
  let hi = chars.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(chars.slice(0, mid).join("").trimEnd() + ELLIPSIS) <= room) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? chars.slice(0, lo).join("").trimEnd() + ELLIPSIS : "";
}

/**
 * `text` broken into at most `maxLines` lines of at most `room` wide, at
 * spaces. The last line takes what is left and is cut with an ellipsis; a
 * single word wider than a line is cut too.
 */
export function wrapText(measure: (text: string) => number, text: string, room: number, maxLines = 2): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    if (lines.length === maxLines - 1) {
      lines.push(fitText(measure, words.slice(i).join(" "), room));
      break;
    }
    let line = words[i++];
    while (i < words.length && measure(`${line} ${words[i]}`) <= room) line += ` ${words[i++]}`;
    lines.push(fitText(measure, line, room));
  }
  return lines;
}

export type PlacedLabel = { text: string; left: number; width: number };

/**
 * Which axis labels to draw, and where: every k-th one, counted from the
 * `anchor` end (the latest day of a time series stays labelled), with k as
 * small as lets them sit centred under their points, `gap` apart and inside
 * minX..maxX (a label at an edge moves inwards). With `truncate` a label may
 * be cut with an ellipsis to the room between its neighbours, keeping at
 * least `minChars` characters; without it (dates) a label is whole or absent.
 */
export function placeLabels(
  measure: (text: string) => number,
  labels: readonly string[],
  centres: readonly number[],
  opts: { minX: number; maxX: number; gap: number; anchor?: "start" | "end"; truncate?: boolean; minChars?: number }
): PlacedLabel[] {
  const n = labels.length;
  const minChars = opts.minChars ?? 4;
  const span = opts.maxX - opts.minX;
  for (let k = 1; k <= n; k++) {
    const idx: number[] = [];
    if (opts.anchor === "end") {
      for (let i = n - 1; i >= 0; i -= k) idx.push(i);
      idx.reverse();
    } else {
      for (let i = 0; i < n; i += k) idx.push(i);
    }
    const placed: PlacedLabel[] = [];
    let fits = true;
    for (let j = 0; j < idx.length && fits; j++) {
      const i = idx[j];
      const before = j > 0 ? centres[i] - centres[idx[j - 1]] : Infinity;
      const after = j < idx.length - 1 ? centres[idx[j + 1]] - centres[i] : Infinity;
      const room = Math.min(span, before - opts.gap, after - opts.gap);
      let text = labels[i];
      if (measure(text) > room) {
        if (!opts.truncate) {
          fits = false;
          break;
        }
        text = fitText(measure, text, room);
        if (Array.from(text).length - 1 < minChars) {
          fits = false;
          break;
        }
      }
      const width = measure(text);
      const left = Math.max(opts.minX, Math.min(centres[i] - width / 2, opts.maxX - width));
      const prev = placed[placed.length - 1];
      if (prev && left < prev.left + prev.width + opts.gap) {
        fits = false;
        break;
      }
      placed.push({ text, left, width });
    }
    if (fits) return placed;
  }
  // Not even one whole label fits: the anchor label, cut to the width.
  const i = opts.anchor === "end" ? n - 1 : 0;
  const text = n ? fitText(measure, labels[i], span) : "";
  if (!text) return [];
  const width = measure(text);
  return [{ text, left: Math.max(opts.minX, Math.min(centres[i] - width / 2, opts.maxX - width)), width }];
}

/** A colour for CSS: "--x" and "var(--x)" as var(--x), any other colour as given, the fallback token when none. */
export function cssColor(color: string | undefined, fallbackToken: string): string {
  const c = color?.trim();
  if (!c) return `var(${fallbackToken})`;
  return c.startsWith("--") ? `var(${c})` : c;
}

/** The token of an order status; an unknown status is neutral. */
export function statusToken(status: string): string {
  return Object.prototype.hasOwnProperty.call(STATUS_TOKENS, status) ? STATUS_TOKENS[status] : "--status-neutral";
}

/** A donut segment's colour, for the canvas and its legend swatch alike: its own colour, its status, or the series order. */
export function segmentColor(point: Point, index: number): string {
  if (point.color) return cssColor(point.color, SEGMENT_TOKENS[0]);
  if (point.status !== undefined) return `var(${statusToken(point.status)})`;
  return `var(${SEGMENT_TOKENS[index % SEGMENT_TOKENS.length]})`;
}

/** A line series' colour for CSS: its own, or --chart-1 to --chart-4 by position. */
export function seriesColor(series: Series, index: number): string {
  return cssColor(series.color, SERIES_TOKENS[index % SERIES_TOKENS.length]);
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

type Surface = { ctx: CanvasRenderingContext2D; w: number; h: number };
type LabelStyle = { px: number; family: string };

const VAR_RE = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/;

/**
 * A CSS colour the canvas can use: the canvas cannot read custom
 * properties, so var(--x) is looked up in the element's computed style,
 * where the theme preset and high contrast have already applied. A token
 * that is not set falls back to the element's text colour.
 */
function canvasColor(cs: CSSStyleDeclaration, css: string): string {
  const m = css.trim().match(VAR_RE);
  if (!m) return css;
  return cs.getPropertyValue(m[1]).trim() || (m[2] ? canvasColor(cs, m[2]) : "") || cs.color;
}

/** The label size from the root font (the toolbar's 12-24px) and the body's face, not system-ui. */
function labelStyle(): LabelStyle {
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return {
    px: Math.round(rootPx * LABEL_EM * 100) / 100,
    family: getComputedStyle(document.body).fontFamily || "sans-serif",
  };
}

function setFont(ctx: CanvasRenderingContext2D, st: LabelStyle, weight = 400): void {
  ctx.font = `${weight} ${st.px}px ${st.family}`;
  // A family list the canvas cannot parse leaves its 10px default: keep the size.
  if (!ctx.font.includes(`${st.px}px`)) ctx.font = `${weight} ${st.px}px sans-serif`;
}

/**
 * Size the bitmap to the canvas's laid-out box at the device pixel ratio,
 * so drawing happens in CSS px. CSS sizes the box (components.css); only
 * horizontal bars pass a `height`, set as a style because it depends on the
 * rows. The width is never set as a style: a fixed width would stop the
 * canvas following its card when the card grows, as it does when the 24px
 * text setting turns two chart columns into one.
 */
function setup(canvas: HTMLCanvasElement, height?: number): Surface | null {
  if (height !== undefined) {
    const css = `${Math.max(1, Math.ceil(height))}px`;
    if (canvas.style.height !== css) canvas.style.height = css;
  }
  const rect = canvas.getBoundingClientRect();
  const ctx = canvas.getContext("2d");
  if (!ctx || rect.width < 1 || rect.height < 1) return null; // hidden: the ResizeObserver draws it when shown
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(canvas.width / rect.width, 0, 0, canvas.height / rect.height, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

function measurer(ctx: CanvasRenderingContext2D): (text: string) => number {
  const cache = new Map<string, number>();
  return (text) => {
    let w = cache.get(text);
    if (w === undefined) {
      w = ctx.measureText(text).width;
      cache.set(text, w);
    }
    return w;
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  corners: "all" | "top" = "all"
): void {
  if (w <= 0 || h <= 0) return;
  r = Math.min(r, w / 2, h / 2);
  const b = corners === "top" ? 0 : r;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - b);
  ctx.quadraticCurveTo(x + w, y + h, x + w - b, y + h);
  ctx.lineTo(x + b, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - b);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

type Frame = { ctx: CanvasRenderingContext2D; left: number; right: number; bottom: number; y: (v: number) => number };

/**
 * The value axis, the grid and the x labels of a line or bar chart. The top
 * pad holds half a tick label, the bottom one a row of x labels; the left
 * pad is the widest tick label plus a gap; ticks are at least 1.8 labels
 * apart, so at most four steps fit whatever the text size.
 */
function plotFrame(
  s: Surface,
  cs: CSSStyleDeclaration,
  st: LabelStyle,
  labels: readonly string[],
  values: readonly number[],
  opts: {
    currency?: boolean;
    anchor: "start" | "end";
    truncate: boolean;
    /** Keep room on the right to centre the last label under the last point. */
    reserveLast: boolean;
    centre: (i: number, left: number, right: number) => number;
  }
): Frame {
  const { ctx, w, h } = s;
  setFont(ctx, st);
  const measure = measurer(ctx);
  const gap = st.px * 0.5;
  const top = Math.ceil(st.px * 0.6);
  const bottom = Math.floor(h - gap - st.px * 1.25);
  const plotH = Math.max(1, bottom - top);
  const intervals = Math.max(1, Math.min(4, Math.floor(plotH / (st.px * 1.8))));
  const scale = niceScale(Math.max(0, ...values.filter((v) => Number.isFinite(v))), intervals);
  const ticks = Array.from({ length: Math.round(scale.top / scale.step) + 1 }, (_, i) => i * scale.step);
  const tickText = ticks.map((v) => compact(v, opts.currency));
  const left = Math.ceil(Math.max(...tickText.map(measure)) + gap);
  const lastHalf = opts.reserveLast && labels.length ? measure(labels[labels.length - 1]) / 2 : 0;
  const right = Math.floor(w - Math.max(gap, lastHalf));
  const y = (v: number) => bottom - (Math.min(Math.max(v, 0), scale.top) / scale.top) * plotH;

  ctx.lineWidth = 1;
  ctx.strokeStyle = canvasColor(cs, "var(--border)");
  ctx.fillStyle = canvasColor(cs, "var(--text-muted)");
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ticks.forEach((v, i) => {
    const ty = Math.round(y(v)) + 0.5;
    if (i > 0) {
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(left, ty);
      ctx.lineTo(right, ty);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillText(tickText[i], left - gap, ty);
  });
  ctx.beginPath();
  ctx.moveTo(left + 0.5, top);
  ctx.lineTo(left + 0.5, bottom + 0.5);
  ctx.lineTo(right, bottom + 0.5);
  ctx.stroke();

  const centres = labels.map((_, i) => opts.centre(i, left, right));
  const placed = placeLabels(measure, labels, centres, { minX: 0, maxX: w, gap, anchor: opts.anchor, truncate: opts.truncate });
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (const p of placed) ctx.fillText(p.text, p.left, bottom + gap);
  return { ctx, left, right, bottom, y };
}

/** Lines, --chart-1 to --chart-4 in order, each with its own dash; a fifth series and on are not drawn. */
export function line(canvas: HTMLCanvasElement, series: readonly Series[], opts: DrawOptions = {}): void {
  if (series.length > MAX_SERIES) console.warn(`Chart: ${series.length} series; a chart shows at most ${MAX_SERIES} (01 §2.4).`);
  const shown = series.slice(0, MAX_SERIES);
  const s = setup(canvas);
  const n = Math.max(0, ...shown.map((x) => x.points.length));
  if (!s || n === 0) return;
  const cs = getComputedStyle(canvas);
  const st = labelStyle();
  const labels = Array.from({ length: n }, (_, i) => shown.find((x) => x.points[i])?.points[i].label ?? "");
  const xAt = (i: number, left: number, right: number) => (n === 1 ? (left + right) / 2 : left + ((right - left) * i) / (n - 1));
  const f = plotFrame(s, cs, st, labels, shown.flatMap((x) => x.points.map((p) => p.value)), {
    currency: opts.currency,
    anchor: "end",
    truncate: false,
    reserveLast: true,
    centre: xAt,
  });
  const { ctx } = f;
  const spacing = n > 1 ? (f.right - f.left) / (n - 1) : Infinity;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  shown.forEach((ser, si) => {
    const colour = canvasColor(cs, seriesColor(ser, si));
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.setLineDash([...SERIES_DASHES[si]]);
    ctx.beginPath();
    let pen = false;
    ser.points.forEach((p, i) => {
      if (!Number.isFinite(p.value)) {
        pen = false;
        return;
      }
      const x = xAt(i, f.left, f.right);
      const y = f.y(p.value);
      if (pen) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      pen = true;
    });
    ctx.stroke();
    ctx.setLineDash([]);
    // Dots where they stay apart: a marker on every value besides the colour.
    if (spacing >= 10) {
      ser.points.forEach((p, i) => {
        if (!Number.isFinite(p.value)) return;
        ctx.beginPath();
        ctx.arc(xAt(i, f.left, f.right), f.y(p.value), 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  });
}

/** Vertical bars, --chart-1 or the given colour; labels are cut with an ellipsis or thinned to fit. */
export function bar(canvas: HTMLCanvasElement, data: readonly Point[], opts: DrawOptions = {}): void {
  const s = setup(canvas);
  if (!s || !data.length) return;
  const cs = getComputedStyle(canvas);
  const st = labelStyle();
  const n = data.length;
  const f = plotFrame(s, cs, st, data.map((d) => d.label), data.map((d) => d.value), {
    currency: opts.currency,
    anchor: "start",
    truncate: true,
    reserveLast: false,
    centre: (i, left, right) => left + ((right - left) / n) * (i + 0.5),
  });
  const slot = (f.right - f.left) / n;
  const barW = Math.min(slot * 0.6, st.px * 4);
  data.forEach((d, i) => {
    if (!Number.isFinite(d.value) || d.value <= 0) return;
    const cx = f.left + slot * (i + 0.5);
    const y = f.y(d.value);
    f.ctx.fillStyle = canvasColor(cs, cssColor(d.color ?? opts.color, "--chart-1"));
    roundRect(f.ctx, cx - barW / 2, y, barW, f.bottom - y, 4, "top");
    f.ctx.fill();
  });
}

/**
 * Horizontal bars, one per row: the label on its own line above the bar,
 * across the full width (two lines at most, then an ellipsis; the data
 * table keeps the whole name), and the value at the bar's end. The longest
 * bar leaves room for the widest value, so no value is cut. The height
 * follows the rows, so it is set here.
 */
export function hbar(canvas: HTMLCanvasElement, data: readonly Point[], opts: DrawOptions = {}): void {
  const probe = canvas.getContext("2d");
  const width = canvas.getBoundingClientRect().width;
  if (!probe || width < 1) return;
  const st = labelStyle();
  const gap = st.px * 0.5;
  const lineH = Math.ceil(st.px * 1.3);
  const barH = Math.max(4, Math.round(st.px * 0.75));
  const rowH = Math.max(barH, lineH);
  const rowGap = Math.round(st.px * 0.75);
  setFont(probe, st);
  const measure = measurer(probe);
  const rows = data.map((d) => ({ d, lines: wrapText(measure, d.label, width, 2), text: formatValue(d.value, opts.currency) }));
  const height = rows.reduce((n, r) => n + r.lines.length * lineH + gap / 2 + rowH, 0) + rowGap * Math.max(0, rows.length - 1);
  const s = setup(canvas, Math.max(1, height));
  if (!s || !rows.length) return;
  const { ctx, w } = s;
  const cs = getComputedStyle(canvas);
  setFont(ctx, st, 700);
  const valueW = Math.max(...rows.map((r) => ctx.measureText(r.text).width));
  const barMax = Math.max(0, w - valueW - gap);
  const max = Math.max(0, ...data.map((d) => (Number.isFinite(d.value) ? d.value : 0)));
  const ink = canvasColor(cs, "var(--text-charcoal)");
  let y = 0;
  for (const r of rows) {
    setFont(ctx, st);
    ctx.fillStyle = ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    r.lines.forEach((text, li) => ctx.fillText(text, 0, y + li * lineH + lineH / 2));
    y += r.lines.length * lineH + gap / 2;
    const len = max > 0 && r.d.value > 0 ? (r.d.value / max) * barMax : 0;
    if (len > 0) {
      ctx.fillStyle = canvasColor(cs, cssColor(r.d.color ?? opts.color, "--chart-1"));
      roundRect(ctx, 0, y + (rowH - barH) / 2, Math.max(len, 2), barH, 4);
      ctx.fill();
    }
    setFont(ctx, st, 700);
    ctx.fillStyle = ink;
    ctx.fillText(r.text, Math.min(len + (len > 0 ? gap : 0), w - ctx.measureText(r.text).width), y + rowH / 2);
    y += rowH + rowGap;
  }
}

/**
 * A ring of segments by status (segmentColor), with DONUT_GAP px of the
 * card showing between them: the gaps are cut out of the drawing, so they
 * are whatever the card is. The total and the legend are HTML (Chart.tsx).
 */
export function donut(canvas: HTMLCanvasElement, data: readonly Point[]): void {
  const s = setup(canvas);
  if (!s) return;
  const { ctx, w, h } = s;
  const outer = Math.min(w, h) / 2 - 1;
  if (outer <= 2) return;
  const inner = outer * DONUT_HOLE;
  // The smallest segment keeps 2px of colour at the hole's edge besides its gap.
  const angles = donutAngles(data.map((d) => d.value), (DONUT_GAP + 2) / inner);
  const cs = getComputedStyle(canvas);
  const cx = w / 2;
  const cy = h / 2;
  const starts: number[] = [];
  let a = -Math.PI / 2;
  data.forEach((d, i) => {
    if (!(angles[i] > 0)) return;
    starts.push(a);
    ctx.beginPath();
    ctx.arc(cx, cy, outer, a, a + angles[i]);
    ctx.arc(cx, cy, inner, a + angles[i], a, true);
    ctx.closePath();
    ctx.fillStyle = canvasColor(cs, segmentColor(d, i));
    ctx.fill();
    a += angles[i];
  });
  if (starts.length < 2) return;
  // destination-out keeps only the stroke's alpha: any opaque colour cuts.
  ctx.globalCompositeOperation = "destination-out";
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = DONUT_GAP;
  ctx.lineCap = "butt";
  for (const t of starts) {
    ctx.beginPath();
    ctx.moveTo(cx + (inner - 1) * Math.cos(t), cy + (inner - 1) * Math.sin(t));
    ctx.lineTo(cx + (outer + 1) * Math.cos(t), cy + (outer + 1) * Math.sin(t));
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}

/**
 * A KPI sparkline: a 2px line in --chart-1 (or a token colour) filling its
 * box, no axes. A value that is missing breaks the line; one with no
 * neighbour is a dot. Fewer than two finite values draw nothing.
 */
export function sparkline(
  canvas: HTMLCanvasElement,
  values: readonly (number | null | undefined)[],
  opts: { color?: string } = {}
): void {
  const s = setup(canvas);
  if (!s) return;
  const { ctx, w, h } = s;
  const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
  const finite = values.filter(ok);
  if (finite.length < 2) return;
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  const pad = LINE_WIDTH;
  const x = (i: number) => pad + ((w - 2 * pad) * i) / Math.max(1, values.length - 1);
  const y = (v: number) => (hi === lo ? h / 2 : pad + (h - 2 * pad) * (1 - (v - lo) / (hi - lo)));
  const colour = canvasColor(getComputedStyle(canvas), cssColor(opts.color, "--chart-1"));
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  values.forEach((v, i) => {
    if (!ok(v)) return;
    if (ok(values[i - 1])) ctx.lineTo(x(i), y(v));
    else ctx.moveTo(x(i), y(v));
  });
  ctx.stroke();
  values.forEach((v, i) => {
    if (!ok(v) || ok(values[i - 1]) || ok(values[i + 1])) return;
    ctx.beginPath();
    ctx.arc(x(i), y(v), LINE_WIDTH, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Draw one kind of chart: what components/Chart.tsx calls on every redraw. */
export function drawChart(
  canvas: HTMLCanvasElement,
  kind: ChartKind,
  data: readonly Point[] | readonly Series[],
  opts: DrawOptions = {}
): void {
  if (kind === "line") line(canvas, isSeries(data) ? data : [{ points: [...data] }], opts);
  else if (kind === "bar") bar(canvas, toPoints(data), opts);
  else if (kind === "hbar") hbar(canvas, toPoints(data), opts);
  else donut(canvas, toPoints(data));
}

/**
 * Draw now, and again whenever the drawing could change: the canvas resizes
 * (its card narrows or widens), the root's font size, contrast or inline
 * theme variables change (the accessibility toolbar and the theme editor's
 * preview), the server's theme block is replaced, or the web fonts finish
 * loading (labels are measured in them). A burst of changes draws once, in
 * the next frame, and a draw that sets a height does not re-enter the
 * ResizeObserver. Chart and Sparkline both use this, so they redraw on the
 * same triggers. Returns the cleanup.
 */
export function watchRedraw(canvas: HTMLCanvasElement, draw: () => void): () => void {
  let frame = 0;
  let live = true;
  const schedule = () => {
    if (live && !frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (live) draw();
      });
    }
  };
  draw();
  const resize = new ResizeObserver(schedule);
  resize.observe(canvas);
  const root = new MutationObserver(schedule);
  root.observe(document.documentElement, { attributes: true, attributeFilter: ["data-font-px", "data-contrast", "style"] });
  const themeBlock = document.getElementById("im-theme");
  const theme = themeBlock ? new MutationObserver(schedule) : null;
  if (themeBlock) theme?.observe(themeBlock, { childList: true, characterData: true, subtree: true });
  const fonts = document.fonts;
  fonts?.addEventListener?.("loadingdone", schedule);
  fonts?.ready?.then(schedule, () => undefined);
  return () => {
    live = false;
    if (frame) cancelAnimationFrame(frame);
    resize.disconnect();
    root.disconnect();
    theme?.disconnect();
    fonts?.removeEventListener?.("loadingdone", schedule);
  };
}

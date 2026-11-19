"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import {
  MAX_SERIES,
  SERIES_DASHES,
  drawChart,
  formatValue,
  isSeries,
  segmentColor,
  seriesColor,
  shares,
  toPoints,
  watchRedraw,
  type ChartKind,
  type Point,
  type Series,
} from "@/lib/charts";

type ChartProps = {
  kind: ChartKind;
  /** line: one to four series (or one series' points). bar, hbar, donut: points; a donut point's `status` picks its colour. */
  data: Point[] | Series[];
  /** Whole pesos in the table, the legend, the bar ends and the ticks. */
  currency?: boolean;
  /** bar and hbar: a token ("var(--brand-brown)") or a colour; --chart-1 when unset. */
  color?: string;
  /** The canvas's name. It names the chart only; the figures are in the legend and the table. */
  ariaLabel: string;
  /** Heading of the table's value column. */
  valueLabel?: string;
  /** Heading of the table's first column. */
  labelHeading?: string;
  /** donut: the thing counted, for the centre total ("24 orders") and the legend. */
  unit?: readonly [one: string, other: string];
  /** Shown instead of the chart when there is nothing to draw (no points; a donut whose total is 0). */
  empty?: string;
};

/**
 * One chart (01 §6.2, ADR-03): a canvas drawn by lib/charts.ts, which
 * redraws on resize, text size, contrast and theme changes, and the same
 * figures as a table under "View as table", collapsed by default.
 *
 * Screen readers meet each figure once. The canvas is role="img" with the
 * caller's name and no figures in it. A donut's total and legend are HTML
 * after the canvas, so they are read in order, as real text; the table holds
 * the same figures, but inside a closed <details> it is read only when
 * someone opens it. The legend's swatches are hidden; each item says its
 * status, count and share in words.
 */
export function Chart({
  kind,
  data,
  currency,
  color,
  ariaLabel,
  valueLabel = "Value",
  labelHeading = "Label",
  unit,
  empty = "No data yet.",
}: ChartProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    return watchRedraw(canvas, () => drawChart(canvas, kind, data, { currency, color }));
  }, [kind, data, currency, color]);

  const series: readonly Series[] =
    kind === "line" ? (isSeries(data) ? data : [{ points: data as Point[] }]).slice(0, MAX_SERIES) : [];
  const points = kind === "line" ? [] : toPoints(data);
  const total = points.reduce((n, p) => n + (Number.isFinite(p.value) && p.value > 0 ? p.value : 0), 0);
  const nothing =
    kind === "line" ? !series.some((s) => s.points.length) : kind === "donut" ? total <= 0 : points.length === 0;
  if (nothing) return <p className="empty">{empty}</p>;

  const word = (n: number) => (unit ? (n === 1 ? unit[0] : unit[1]) : "");
  const pct = kind === "donut" ? shares(points.map((p) => p.value)) : [];
  // A count that is there but rounds to 0%, or a part that rounds to 100%, says so.
  const shareText = (i: number) => {
    const v = Number.isFinite(points[i].value) && points[i].value > 0 ? points[i].value : 0;
    if (pct[i] === 0 && v > 0) return "under 1%";
    if (pct[i] === 100 && v < total) return "over 99%";
    return `${pct[i]}%`;
  };

  // The table: one row per label; a column per series for lines, a share column for a donut.
  const many = series.length > 1;
  const heads =
    kind === "line"
      ? many
        ? series.map((s, i) => s.label ?? `Series ${i + 1}`)
        : [valueLabel]
      : kind === "donut"
        ? [valueLabel, "Share"]
        : [valueLabel];
  const rowCount = kind === "line" ? Math.max(...series.map((s) => s.points.length)) : points.length;
  const rows = Array.from({ length: rowCount }, (_, i) => {
    if (kind !== "line") {
      const p = points[i];
      return { label: p.label, cells: kind === "donut" ? [formatValue(p.value, currency), shareText(i)] : [formatValue(p.value, currency)] };
    }
    const label = series.find((s) => s.points[i])?.points[i].label ?? "";
    return { label, cells: series.map((s) => (s.points[i] ? formatValue(s.points[i].value, currency) : "—")) };
  });

  const canvas = (
    <canvas
      ref={ref}
      className={kind === "donut" ? "chart-donut__canvas" : `chart__canvas chart__canvas--${kind === "hbar" ? "rows" : "plot"}`}
      role="img"
      aria-label={ariaLabel}
    />
  );

  return (
    <>
      {kind === "donut" ? (
        <div className="chart-donut">
          <div className="chart-donut__ring">
            {canvas}
            <p className="chart-donut__total">
              <strong className="chart-donut__count">{formatValue(total, currency)}</strong>
              {unit ? (
                <>
                  {" "}
                  <span className="chart-donut__unit">{word(total)}</span>
                </>
              ) : null}
            </p>
          </div>
          <ul className="chart-legend">
            {points.map((p, i) => {
              const parts: ReactNode = (
                <>
                  <span className="chart-legend__swatch" aria-hidden="true" style={{ background: segmentColor(p, i) }} />
                  <span className="chart-legend__label">{p.label}</span>{" "}
                  <span className="chart-legend__value">
                    {formatValue(p.value, currency)}
                    {/* A no-break space: .sr-only is absolutely positioned, so a
                        plain leading space would collapse into "6orders". */}
                    <span className="sr-only">{unit ? ` ${word(p.value)},` : ","}</span>{" "}
                    <span className="chart-legend__share">{shareText(i)}</span>
                  </span>
                </>
              );
              // With an href (the seller's donut) the item is a link to the
              // list behind it, named by the same words ("Pending 2 orders,
              // 15%"), and the link takes the item's grid. Without one (the
              // admin donut) the item is as it was.
              return p.href ? (
                <li key={`${p.label}-${i}`} className="chart-legend__entry">
                  <Link className="chart-legend__item chart-legend__link" href={p.href}>
                    {parts}
                  </Link>
                </li>
              ) : (
                <li key={`${p.label}-${i}`} className="chart-legend__item">
                  {parts}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        canvas
      )}

      {many ? (
        // Two or more lines: which is which, by colour and by dash (1.4.1).
        <ul className="chart-legend chart-legend--series">
          {series.map((s, i) => (
            <li key={`${s.label ?? ""}-${i}`} className="chart-legend__item">
              <svg className="chart-legend__line" viewBox="0 0 24 8" aria-hidden="true" focusable="false">
                <line
                  x1="1"
                  y1="4"
                  x2="23"
                  y2="4"
                  style={{ stroke: seriesColor(s, i) }}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={SERIES_DASHES[i].join(" ") || undefined}
                />
              </svg>
              <span className="chart-legend__label">{s.label ?? `Series ${i + 1}`}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <details className="chart-data-table">
        <summary>View as table</summary>
        {/* Scrolls inside the card on a narrow screen with large text, so it
            is focusable and named, as TableWrap's region is (2.1.1). */}
        <div className="chart-data-table__scroll" role="region" aria-label={`${ariaLabel}, table`} tabIndex={0}>
          <table>
            <caption className="sr-only">{ariaLabel}</caption>
            <thead>
              <tr>
                <th scope="col">{labelHeading}</th>
                {heads.map((h, i) => (
                  <th key={`${h}-${i}`} scope="col" className="num">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.label}-${i}`}>
                  <th scope="row">{r.label}</th>
                  {r.cells.map((c, j) => (
                    <td key={j} className="num">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

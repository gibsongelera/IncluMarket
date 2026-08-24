"use client";

import { useEffect, useRef } from "react";
import * as charts from "@/lib/charts";
import type { Point, Series } from "@/lib/charts";

type ChartProps = {
  kind: "line" | "bar" | "pie";
  data: Point[] | Series[];
  currency?: boolean;
  color?: string;
  height?: number;
  ariaLabel: string;
  /** Column heading for the value column in the text alternative. */
  valueLabel?: string;
};

function isSeries(data: Point[] | Series[]): data is Series[] {
  return data.length > 0 && "points" in (data[0] as Series);
}

/** Flatten either shape into rows for the text alternative. */
function toRows(data: Point[] | Series[]): { label: string; value: number }[] {
  if (!data.length) return [];
  if (isSeries(data)) return data.flatMap((s) => s.points);
  return data as Point[];
}

function displayValue(value: number, currency?: boolean): string {
  if (currency) {
    return value.toLocaleString("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    });
  }
  return value.toLocaleString("en-PH");
}

export function Chart({
  kind,
  data,
  currency,
  color,
  height = 240,
  ariaLabel,
  valueLabel = "Value",
}: ChartProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const draw = () => {
      if (kind === "line") charts.line(canvas, data as Series[], { currency });
      else if (kind === "bar") charts.bar(canvas, data as Point[], { currency, color });
      else charts.pie(canvas, data as Point[]);
    };

    draw();

    // Redraw when the container resizes (not just the window), so the chart is
    // correct inside a collapsing grid column, and when the accessibility
    // toolbar changes the root font size, which now drives the label size.
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas);

    const mutationObserver = new MutationObserver(draw);
    mutationObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-font-px", "data-contrast", "style"],
    });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [kind, data, currency, color]);

  const rows = toRows(data);

  return (
    <>
      {/*
        The canvas carries role="img" plus a name, which tells a screen reader
        that a chart is present but nothing about the data in it. WCAG 1.1.1
        wants an equivalent, so the same numbers are also offered as a real
        table. Collapsed by default, so it costs sighted users nothing — and it
        is genuinely useful to everyone, since reading an exact figure off a bar
        chart is guesswork.
      */}
      <canvas ref={ref} height={height} role="img" aria-label={ariaLabel} />

      <details className="chart-data-table">
        <summary>View as table</summary>
        <table>
          <caption className="sr-only">{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Label</th>
              <th scope="col">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2}>No data yet.</td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.label}-${i}`}>
                  <th scope="row">{r.label}</th>
                  <td>{displayValue(r.value, currency)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </details>
    </>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { sparkline, watchRedraw } from "@/lib/charts";

/**
 * A KPI card's sparkline (01 §6.1, ADR-03): a 2px line in --chart-1, or a
 * token colour, that fills its box, with no axes. Fewer than two finite
 * values draw nothing. It redraws on the same triggers as Chart (resize,
 * text size, contrast, theme), through the same watchRedraw.
 *
 * The canvas is hidden from screen readers. It carries no words, so it must
 * not be used alone: KpiCard renders it with a text summary beside it
 * (lib/kpi.ts rangeSummary).
 */
export function Sparkline({ values, color }: { values: readonly (number | null | undefined)[]; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    return watchRedraw(canvas, () => sparkline(canvas, values, { color }));
  }, [values, color]);

  return <canvas ref={ref} className="sparkline" aria-hidden="true" />;
}

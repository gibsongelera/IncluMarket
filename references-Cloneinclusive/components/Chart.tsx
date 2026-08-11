"use client";

import { useEffect, useRef } from "react";
import * as charts from "@/lib/charts";
import type { Point, Series } from "@/lib/charts";

type ChartProps = {
  kind: "line" | "bar" | "pie";
  data: Point[] | Series[];
  currency?: boolean;
  color?: string;
  width?: number;
  height?: number;
  ariaLabel: string;
};

export function Chart({
  kind,
  data,
  currency,
  color,
  width = 600,
  height = 240,
  ariaLabel,
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
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [kind, data, currency, color]);

  return (
    <canvas ref={ref} width={width} height={height} role="img" aria-label={ariaLabel} />
  );
}

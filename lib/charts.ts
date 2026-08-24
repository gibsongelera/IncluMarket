"use client";

// Vanilla Canvas 2D charts — bar, line, pie. Ported 1:1 from assets/js/charts.js.
// Colors pull directly from the DSWD tokens via getComputedStyle.

export type Point = { label: string; value: number };
export type Series = { points: Point[]; color?: string };

function tokens() {
  const cs = getComputedStyle(document.documentElement);
  return {
    blue: cs.getPropertyValue("--brand-blue").trim() || "#2E3192",
    red: cs.getPropertyValue("--brand-red").trim() || "#EE1C25",
    yellow: cs.getPropertyValue("--brand-yellow").trim() || "#FEF200",
    charcoal: cs.getPropertyValue("--text-charcoal").trim() || "#212529",
    muted: cs.getPropertyValue("--text-muted").trim() || "#5A6169",
    border: cs.getPropertyValue("--border").trim() || "#DEE2E6",
    surface: cs.getPropertyValue("--surface-gray").trim() || "#F8F9FA",
    // Axis/label size derived from the root font, which the accessibility
    // toolbar drives between 12 and 24px. These were hardcoded at 11px, so a
    // user who scaled the interface to 24px still got 11px chart labels —
    // roughly 6px of effective height once the canvas is squeezed onto a
    // phone. Floor of 11 keeps dense axes readable at the smallest setting.
    labelPx: Math.max(11, Math.round(parseFloat(cs.fontSize || "16") * 0.7)),
  };
}

/** Label font at the current accessibility scale. */
export function labelFont(t: ReturnType<typeof tokens>, weight = ""): string {
  return `${weight}${t.labelPx}px system-ui, -apple-system, sans-serif`.trim();
}

function resize(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  // No minimum width: a 300px floor pushed the canvas wider than a 320px
  // viewport and forced the page to scroll horizontally. Fall back only when
  // the element has not been laid out yet.
  const w = Math.max(1, Math.round(rect.width) || 320);
  // Taller aspect on phones, otherwise bars collapse to a few pixels.
  const ratio = w < 480 ? 0.62 : 0.4;
  const h = Math.round(w * ratio);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

type T = ReturnType<typeof tokens>;

function drawAxes(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t: T
) {
  ctx.strokeStyle = t.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0, y1);
  ctx.moveTo(x0, y1);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function niceMax(m: number) {
  if (m <= 5) return Math.max(5, Math.ceil(m));
  const pow = Math.pow(10, Math.floor(Math.log10(m)));
  return Math.ceil(m / pow) * pow;
}

function fmt(n: number, currency?: boolean) {
  if (!currency) {
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
    return Math.round(n).toString();
  }
  if (Math.abs(n) >= 1000) return "₱" + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return "₱" + Math.round(n);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (h <= 0) return;
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function bar(
  canvas: HTMLCanvasElement,
  data: Point[],
  opts: { color?: string; currency?: boolean } = {}
) {
  const { ctx, w, h } = resize(canvas);
  const t = tokens();
  ctx.clearRect(0, 0, w, h);
  ctx.font = labelFont(t);
  ctx.fillStyle = t.charcoal;

  const padL = 44,
    padR = 12,
    padT = 12,
    padB = 34;
  const chartW = w - padL - padR,
    chartH = h - padT - padB;
  const maxVal = niceMax(Math.max.apply(null, data.map((d) => d.value)) || 1);

  drawAxes(ctx, padL, padT, w - padR, h - padB, t);

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const y = padT + chartH - chartH * (i / ticks);
    const val = (maxVal * i) / ticks;
    ctx.fillStyle = t.muted;
    ctx.fillText(fmt(val, opts.currency), padL - 6, y);
    ctx.strokeStyle = t.border;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const barW = (chartW / data.length) * 0.6;
  const gap = (chartW / data.length) * 0.4;
  const color = opts.color || t.blue;

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  data.forEach((d, i) => {
    const x = padL + (chartW / data.length) * i + gap / 2;
    const barH = (d.value / maxVal) * chartH;
    const y = padT + chartH - barH;
    ctx.fillStyle = color;
    roundRect(ctx, x, y, barW, barH, 4);
    ctx.fill();
    ctx.fillStyle = t.muted;
    ctx.fillText(d.label, x + barW / 2, padT + chartH + 6);
  });
}

export function line(
  canvas: HTMLCanvasElement,
  series: Series[],
  opts: { currency?: boolean } = {}
) {
  const { ctx, w, h } = resize(canvas);
  const t = tokens();
  ctx.clearRect(0, 0, w, h);
  ctx.font = labelFont(t);

  const padL = 44,
    padR = 12,
    padT = 12,
    padB = 34;
  const chartW = w - padL - padR,
    chartH = h - padT - padB;
  const allVals: number[] = [];
  series.forEach((s) => s.points.forEach((p) => allVals.push(p.value)));
  const maxVal = niceMax(Math.max.apply(null, allVals) || 1);
  const n = series[0].points.length;

  drawAxes(ctx, padL, padT, w - padR, h - padB, t);

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const y = padT + chartH - chartH * (i / ticks);
    const val = (maxVal * i) / ticks;
    ctx.fillStyle = t.muted;
    ctx.fillText(fmt(val, opts.currency), padL - 6, y);
    ctx.strokeStyle = t.border;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  series[0].points.forEach((p, i) => {
    const x = padL + chartW * (i / Math.max(1, n - 1));
    ctx.fillStyle = t.muted;
    if (i % Math.max(1, Math.floor(n / 6)) === 0 || i === n - 1) {
      ctx.fillText(p.label, x, padT + chartH + 6);
    }
  });

  series.forEach((s, si) => {
    const color = s.color || [t.blue, t.red, t.yellow][si % 3];
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    s.points.forEach((p, i) => {
      const x = padL + chartW * (i / Math.max(1, n - 1));
      const y = padT + chartH - (p.value / maxVal) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    s.points.forEach((p, i) => {
      const x = padL + chartW * (i / Math.max(1, n - 1));
      const y = padT + chartH - (p.value / maxVal) * chartH;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

export function pie(canvas: HTMLCanvasElement, data: Point[]) {
  const { ctx, w, h } = resize(canvas);
  const t = tokens();
  ctx.clearRect(0, 0, w, h);

  const total = data.reduce((n, d) => n + d.value, 0) || 1;
  const cx = w / 2 - 60,
    cy = h / 2,
    r = Math.min(w * 0.35, h * 0.38);
  const colors = [t.blue, t.red, t.yellow, t.muted, t.charcoal, "#146C43"];
  let start = -Math.PI / 2;
  data.forEach((d, i) => {
    const slice = (d.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + slice);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    ctx.strokeStyle = t.surface;
    ctx.lineWidth = 2;
    ctx.stroke();
    start += slice;
  });

  ctx.font = labelFont(t);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const lx = cx + r + 24,
    ly = cy - (data.length * 20) / 2;
  data.forEach((d, i) => {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(lx, ly + i * 20 - 6, 12, 12);
    ctx.fillStyle = t.charcoal;
    const pct = Math.round((d.value / total) * 100);
    ctx.fillText(d.label + "  " + pct + "%", lx + 20, ly + i * 20);
  });
}

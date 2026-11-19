"use client";

import { useEffect, useState } from "react";

function left(ends: number, now: number): string {
  const ms = Math.max(0, ends - now);
  const mins = Math.floor(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (ms <= 0) return "Ended";
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${Math.max(1, m)}m left`;
}

/**
 * Time left on a flash sale. Updates once a minute (no ticking seconds) and
 * is hidden from screen readers — a changing number would be announced or
 * re-read constantly. The `label` (the end time in words) is what assistive
 * technology gets instead.
 */
export function Countdown({ endsAt, label }: { endsAt: string; label: string }) {
  const ends = Date.parse(endsAt);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <span className="countdown">
      <span aria-hidden="true">{now === null ? "" : left(ends, now)}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

import Link from "next/link";
import { Icon } from "./Icon";
import { Sparkline } from "./Sparkline";
import { kpiTrend, type KpiGood } from "@/lib/kpi";

/** The icon tile: a -100 tint with the icon in its role colour (01 §6.1). */
export type KpiIconTone = "blue" | "brown" | "teal" | "ok" | "warn";

export interface KpiCardProps {
  label: string;
  /** Formatted by the caller ("₱128,430"); a number is grouped. null: it could not be read. */
  value: string | number | null;
  /** The list behind the number. */
  href: string;
  /** A name from components/Icon.tsx, shown in a tinted tile beside the label. */
  icon?: string;
  tone?: KpiIconTone;
  /** The raw figures; lib/kpi.ts words and colours the change. */
  trend?: { current: number | null; previous: number | null; good: KpiGood; period?: string };
  /**
   * A sparkline of the figure's recent values, with its words: the summary
   * (lib/kpi.ts rangeSummary, "Daily sales, lowest ₱0, highest ₱6,000") is
   * what a screen reader gets, since the line itself is hidden from it.
   */
  spark?: { values: readonly (number | null | undefined)[]; summary: string };
  /** A "Needs attention" tile: a brown bar while its count is above 0. */
  queue?: boolean;
}

const TREND_ICON = { up: "arrow-up", down: "arrow-down", flat: "minus", new: "sparkles" } as const;

/**
 * One KPI card (01 §6.1, ADR-02). The whole card is a link to the list
 * behind the number, and a link is named by its text, so every part of it
 * is plain words: the label, the value and the trend ("up 18.2% vs previous
 * 30 days (better)") and the sparkline's summary. The icons, the sparkline and the
 * "—" of a missing figure are hidden from screen readers, and nothing under
 * aria-hidden can take focus. A server component: nothing on it is
 * interactive (Sparkline is a client component only to draw). The spaces
 * between the parts keep the words apart in the link's name; a flex
 * container does not render them.
 */
export function KpiCard({
  label,
  value,
  href,
  icon,
  tone = "blue",
  trend,
  spark,
  queue = false,
}: KpiCardProps) {
  const unavailable = value === null;
  const t = trend && !unavailable ? kpiTrend(trend.current, trend.previous, trend.good, trend.period) : null;
  const waiting = queue && typeof value === "number" && value > 0;
  return (
    <Link href={href} className={`kpi${queue ? " kpi--queue" : ""}${waiting ? " is-waiting" : ""}`}>
      <span className="kpi__head">
        <span className="kpi__label">{label}</span>
        {icon ? (
          <span className={`kpi__icon kpi__icon--${tone}`} aria-hidden="true">
            <Icon name={icon} />
          </span>
        ) : null}
      </span>{" "}
      <strong className="kpi__value">
        {unavailable ? <span aria-hidden="true">—</span> : typeof value === "number" ? value.toLocaleString("en-PH") : value}
      </strong>
      {unavailable ? (
        <>
          {" "}
          <span className="small muted">Needs a database update</span>
        </>
      ) : null}
      {t && t.kind !== "none" ? (
        <>
          {" "}
          <span className={`kpi__trend kpi__trend--${t.tone}`}>
            <Icon name={TREND_ICON[t.kind]} />
            {t.words}
          </span>
        </>
      ) : null}
      {spark && !unavailable ? (
        <>
          <span className="kpi__spark" aria-hidden="true">
            <Sparkline values={spark.values} />
          </span>{" "}
          {/* The full stop keeps the summary apart from the trend's words in
              the link's name ("…30 days. Daily sales, lowest …"). */}
          <span className="sr-only">{`. ${spark.summary}`}</span>
        </>
      ) : null}
    </Link>
  );
}

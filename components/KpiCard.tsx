import Link from "next/link";
import { Icon } from "./Icon";
import { Sparkline } from "./Sparkline";
import { kpiTrend, type KpiGood } from "@/lib/kpi";

/** The icon tile: a -100 tint with the icon in its role colour (01 §6.1). */
export type KpiIconTone = "blue" | "brown" | "teal" | "ok" | "warn";

export interface KpiCardProps {
  label: string;
  /** Formatted by the caller ("₱128,430"); a number is grouped. null: it could not be read, or, with `empty`, there is none yet. */
  value: string | number | null;
  /**
   * The words for a figure that is none yet rather than missing ("No
   * orders in the last 30 days": no orders to average), shown under the
   * "—" when value is null in place of "Needs a database update". Pass it
   * only for a figure that was read.
   */
  empty?: string;
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
 * "—" of a missing or empty figure are hidden from screen readers (the words
 * under it say which: "Needs a database update" or the caller's `empty`),
 * and nothing under aria-hidden can take focus. A server component: nothing on it is
 * interactive (Sparkline is a client component only to draw). The spaces
 * between the parts keep the words apart in the link's name; a flex
 * container does not render them.
 */
export function KpiCard({
  label,
  value,
  empty,
  href,
  icon,
  tone = "blue",
  trend,
  spark,
  queue = false,
}: KpiCardProps) {
  // No figure to show: unread (a migration this database lacks) or, with
  // `empty`, none yet. Either way no trend and no sparkline.
  const missing = value === null;
  const t = trend && !missing ? kpiTrend(trend.current, trend.previous, trend.good, trend.period) : null;
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
        {missing ? <span aria-hidden="true">—</span> : typeof value === "number" ? value.toLocaleString("en-PH") : value}
      </strong>
      {missing ? (
        <>
          {" "}
          <span className="small muted">{empty || "Needs a database update"}</span>
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
      {spark && !missing ? (
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

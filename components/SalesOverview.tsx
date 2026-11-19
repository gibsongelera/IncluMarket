"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Chart } from "./Chart";
import { TabPanel, Tabs } from "./Tabs";
import type { Point } from "@/lib/charts";

type View = "revenue" | "orders";

/**
 * A dashboard's sales chart (03 §2, 04 §2, 01 §6.2): the card's head, with
 * money / Orders tabs in its slot, and the chosen series as a line in the
 * tab panel. Only the tab state lives here: the server page renders the
 * card around it, the title passed in as `heading`, and the card's empty
 * and unavailable states without any tabs. The points come labelled
 * ("11/14", "11/4–11/10") from the page; money is drawn and tabled in whole
 * pesos.
 *
 * The words default to the admin overview's (Revenue, per day, the last 30
 * days); the Seller Centre passes its own (Sales, per week, the last 12
 * weeks: 04 §5 says "Sales", not "revenue").
 */
export function SalesOverview({
  heading,
  revenue,
  orders,
  moneyLabel = "Revenue",
  step = "Day",
  span = "last 30 days",
  idPrefix = "ov-sales",
}: {
  heading: ReactNode;
  revenue: Point[];
  orders: Point[];
  /** The money tab's word, the table's column and the chart's name: "Revenue", "Sales". */
  moneyLabel?: string;
  /** What one point covers: the table's first column, and the charts' names ("… per week"). */
  step?: "Day" | "Week";
  /** The span the points cover, for the charts' names and empty states: "last 12 weeks". */
  span?: string;
  idPrefix?: string;
}) {
  const [view, setView] = useState<View>("revenue");
  // Stable per series, so Chart's draw effect runs on a tab change only.
  const data = useMemo(() => ({ revenue: [{ points: revenue }], orders: [{ points: orders }] }), [revenue, orders]);
  const views = useMemo(
    () =>
      [
        { value: "revenue", label: moneyLabel },
        { value: "orders", label: "Orders" },
      ] as const satisfies readonly { value: View; label: string }[],
    [moneyLabel]
  );
  const per = `per ${step.toLowerCase()}, ${span}`;

  return (
    <>
      <div className="chart-card__head">
        {heading}
        <Tabs items={views} value={view} onChange={setView} label="Sales chart" idPrefix={idPrefix} />
      </div>
      <TabPanel idPrefix={idPrefix} value={view}>
        {view === "revenue" ? (
          <Chart
            key="revenue"
            kind="line"
            currency
            ariaLabel={`${moneyLabel} ${per}`}
            labelHeading={step}
            valueLabel={moneyLabel}
            empty={`No sales in the ${span}`}
            data={data.revenue}
          />
        ) : (
          <Chart
            key="orders"
            kind="line"
            ariaLabel={`Orders ${per}`}
            labelHeading={step}
            valueLabel="Orders"
            empty={`No orders in the ${span}`}
            data={data.orders}
          />
        )}
      </TabPanel>
    </>
  );
}

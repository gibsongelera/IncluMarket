"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Chart } from "./Chart";
import { TabPanel, Tabs } from "./Tabs";
import type { Point } from "@/lib/charts";

type View = "revenue" | "orders";

const VIEWS = [
  { value: "revenue", label: "Revenue" },
  { value: "orders", label: "Orders" },
] as const satisfies readonly { value: View; label: string }[];

const ID = "ov-sales";

/**
 * The admin overview's sales chart (03 §2, 01 §6.2): the card's head, with
 * Revenue / Orders tabs in its slot, and the chosen series as a line over
 * the 30 days in the tab panel. Only the tab state lives here: the server
 * page renders the card around it, the title passed in as `heading`, and
 * the card's empty and unavailable states without any tabs. The points come
 * labelled ("11/14") from the page; revenue is drawn and tabled in whole
 * pesos.
 */
export function SalesOverview({ heading, revenue, orders }: { heading: ReactNode; revenue: Point[]; orders: Point[] }) {
  const [view, setView] = useState<View>("revenue");
  // Stable per series, so Chart's draw effect runs on a tab change only.
  const data = useMemo(() => ({ revenue: [{ points: revenue }], orders: [{ points: orders }] }), [revenue, orders]);

  return (
    <>
      <div className="chart-card__head">
        {heading}
        <Tabs items={VIEWS} value={view} onChange={setView} label="Sales chart" idPrefix={ID} />
      </div>
      <TabPanel idPrefix={ID} value={view}>
        {view === "revenue" ? (
          <Chart
            key="revenue"
            kind="line"
            currency
            ariaLabel="Revenue per day, last 30 days"
            labelHeading="Day"
            valueLabel="Revenue"
            empty="No sales in the last 30 days"
            data={data.revenue}
          />
        ) : (
          <Chart
            key="orders"
            kind="line"
            ariaLabel="Orders per day, last 30 days"
            labelHeading="Day"
            valueLabel="Orders"
            empty="No orders in the last 30 days"
            data={data.orders}
          />
        )}
      </TabPanel>
    </>
  );
}

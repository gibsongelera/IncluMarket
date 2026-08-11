import { formatDateTime } from "@/lib/format";
import { Pill } from "./Pill";
import type { Order, OrderStatusHistoryEntry } from "@/lib/types";

export function OrderTimeline({
  order,
  history,
}: {
  order: Order;
  history: OrderStatusHistoryEntry[];
}) {
  const entries: OrderStatusHistoryEntry[] = history.length
    ? history
    : [
        {
          id: 0,
          order_id: order.id,
          status: order.order_status,
          note: null,
          created_by: null,
          created_at: order.created_at,
        },
      ];

  return (
    <ol className="order-timeline" aria-label="Order status history">
      {entries.map((h, i) => (
        <li
          key={h.id || i}
          className={`order-timeline__step${i === entries.length - 1 ? " is-current" : ""}`}
        >
          <Pill status={h.status} />
          <span className="muted small">{formatDateTime(h.created_at)}</span>
          {h.note ? <p className="muted small order-timeline__note">{h.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}

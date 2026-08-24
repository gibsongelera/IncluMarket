"use client";

import { useEffect, useRef } from "react";

/**
 * Wrapper for the dashboard data tables.
 *
 * Fixes two things at once, for all seven tables, without touching a single
 * <td>:
 *
 * 1. KEYBOARD ACCESS (WCAG 2.1.1). `.table-wrap` scrolls horizontally but had
 *    no tabindex and no accessible name, so a keyboard-only user could not
 *    scroll it — on the admin Users table that means the Actions column was
 *    simply unreachable without a mouse. A scrollable region needs to be
 *    focusable and named.
 *
 * 2. PHONE LAYOUT. Below 768px `.data-table--cards` turns each row into a
 *    stacked card whose cells are labelled by `td::before { content: attr(
 *    data-label) }`. Rather than hand-adding data-label to every cell in every
 *    table (and having the next person forget), the labels are copied from the
 *    real <thead> after mount, so they cannot drift out of sync with the
 *    headers. Cells whose header is empty — the action columns — get an empty
 *    label, which the CSS renders as a full-width row with no prefix.
 *
 * `display: block` on table elements drops their implicit ARIA semantics, so
 * the roles are restated explicitly and survive the swap.
 */
export function TableWrap({
  label,
  children,
}: {
  /** Accessible name for the scroll region, e.g. "Users". Required. */
  label: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const table = root.querySelector("table");
    if (!table) return;

    const applyLabels = () => {
      const headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
        (th.textContent || "").trim()
      );
      if (!headers.length) return;

      for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
        const cells = Array.from(row.children);
        cells.forEach((cell, i) => {
          if (cell.tagName !== "TD") return;
          cell.setAttribute("data-label", headers[i] ?? "");
          cell.setAttribute("role", "cell");
        });
        row.setAttribute("role", "row");
      }
    };

    applyLabels();

    // Rows change with filtering, pagination and status updates.
    const observer = new MutationObserver(applyLabels);
    const body = table.querySelector("tbody");
    if (body) observer.observe(body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [children]);

  return (
    <div
      ref={ref}
      className="table-wrap"
      // Focusable so the horizontal scroll is reachable without a pointer.
      tabIndex={0}
      role="region"
      aria-label={label}
    >
      {children}
    </div>
  );
}

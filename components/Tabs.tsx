"use client";

import { useId, useRef } from "react";

/**
 * The ARIA Tabs pattern, implemented once.
 *
 * Four dashboards (buyer Orders, seller Orders, admin Products, admin Tickets)
 * hand-rolled a tab strip with `role="tab"` and `aria-selected` and nothing
 * else: no `aria-controls`, no ids, no `role="tabpanel"` anywhere in those
 * files, no roving tabIndex, no arrow keys. The whole codebase had
 * `aria-selected` eight times and `aria-controls` three. So a screen-reader
 * user was told "tab, 1 of 5" with no panel association, and a keyboard user
 * had to Tab through every filter to reach the content.
 *
 * That also directly contradicted app/accessibility/page.tsx, which claimed
 * tabs were "fully keyboard-operable ... with arrow-key navigation".
 *
 * LandingClient already did this correctly; this is that implementation lifted
 * into one place.
 *
 * Keyboard: Left/Right move between tabs and wrap, Home/End jump to the ends,
 * and selection follows focus (the standard for a filter strip, where showing
 * the panel is cheap and immediate).
 */

export interface TabItem<T extends string> {
  value: T;
  label: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  idPrefix,
}: {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Accessible name for the tablist, e.g. "Order status". */
  label: string;
  /** Stable prefix so ids survive re-renders; defaults to a generated one. */
  idPrefix?: string;
}) {
  const generated = useId();
  const prefix = idPrefix ?? generated;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const activeIndex = Math.max(
    0,
    items.findIndex((i) => i.value === value)
  );

  function focusTab(index: number) {
    const bounded = (index + items.length) % items.length;
    refs.current[bounded]?.focus();
    onChange(items[bounded].value);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        focusTab(index + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusTab(index - 1);
        break;
      case "Home":
        e.preventDefault();
        focusTab(0);
        break;
      case "End":
        e.preventDefault();
        focusTab(items.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`${prefix}-tab-${item.value}`}
            aria-controls={`${prefix}-panel`}
            aria-selected={selected}
            // Roving tabIndex: exactly one tab is in the tab order, and the
            // arrow keys move within the group.
            tabIndex={selected ? 0 : -1}
            ref={(el) => {
              refs.current[index] = el;
            }}
            className={`tab ${selected ? "tab--active" : ""}`}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The panel the tablist controls. Focusable so that a keyboard user landing
 * here after the tab strip can scroll it, and labelled by the selected tab.
 */
export function TabPanel({
  idPrefix,
  value,
  children,
}: {
  idPrefix: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={`${idPrefix}-panel`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${value}`}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

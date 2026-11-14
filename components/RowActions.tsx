"use client";

import { Children, Fragment, isValidElement, useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * The actions a row offers. Children.toArray already drops null, undefined
 * and false from conditionals; fragments are opened (the list clients wrap a
 * pair of buttons in one) and the {" "} spacers between buttons do not count.
 */
function countActions(children: ReactNode): number {
  let n = 0;
  for (const child of Children.toArray(children)) {
    if (typeof child === "string") {
      if (child.trim() !== "") n++;
    } else if (isValidElement(child) && child.type === Fragment) {
      n += countActions((child as ReactElement<{ children?: ReactNode }>).props.children);
    } else {
      n++;
    }
  }
  return n;
}

export interface RowActionsProps {
  /** The row's name, e.g. "order #123": the button shows "Actions" and is named "Actions for order #123". */
  label: string;
  /** The row's existing buttons and links, unchanged. Destructive ones still open ConfirmDialog with the reason. */
  children?: ReactNode;
}

/**
 * A list row's "Actions" menu (ADR-04, 03 §6, 01 §6.3): a disclosure button
 * (aria-expanded, aria-controls) that shows the row's own buttons under it.
 * Not role="menu" (its arrow-key contract), not the Popover API (it needs
 * anchor positioning), not the buttons inline (too wide on a phone). A row
 * with one action or none gets its children as they are.
 *
 * - The panel is in the flow under the button, never floating: TableWrap
 *   scrolls sideways, which would clip a popover on the last rows.
 * - Closed, the panel is hidden, not unmounted. Its buttons open
 *   ConfirmDialog, a native <dialog> that gives focus back to the button
 *   that opened it, so that button must still exist and show; opening a
 *   dialog from the panel leaves the panel open.
 * - Opening does not move focus (APG disclosure); Tab goes into the items.
 *   Escape anywhere in it closes it and focuses the button. A pointer click
 *   outside closes it, except while a dialog is open or on a dialog; if focus
 *   was in the panel it moves to the button. It closes on the click, not on
 *   pointerdown: collapsing the panel at pointerdown moved everything under
 *   it before the mouseup, so that click (the next row's Actions, Next page)
 *   landed on whatever moved there, and a touch that scrolled the page
 *   closed it. A keyboard press on another control (a click with detail 0)
 *   leaves it open, so several rows can be open at once.
 * - An action that removes the button holding focus (Approve on a pending
 *   product) sends focus to this button, not to <body>. One that leaves the
 *   row a single action turns it back into a plain button; placing focus
 *   then is the list's job.
 *
 * Put it alone in a plain action cell (<td>, empty header), not in the old
 * inline .row-actions cell.
 */
export function RowActions({ label, children }: RowActionsProps) {
  const count = countActions(children);
  const isMenu = count > 1;
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** The item in the panel that last had focus, until focus moves elsewhere. */
  const lastItemRef = useRef<HTMLElement | null>(null);

  const close = useCallback((how: "escape" | "pointer" | "toggle") => {
    const panel = panelRef.current;
    const focusInPanel = !!panel && panel.contains(document.activeElement);
    lastItemRef.current = null;
    // Focus left in the panel would fall to <body> once it is hidden. After
    // a pointer click the page stays where it is.
    if (how === "escape" || focusInPanel) toggleRef.current?.focus({ preventScroll: how === "pointer" });
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (e.detail === 0) return; // Enter or Space on another control
      const target = e.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target)) return;
      if (document.querySelector("dialog[open]")) return;
      if (target instanceof Element && target.closest("dialog")) return;
      close("pointer");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open, close]);

  // The item that had focus is gone (an action re-rendered the row): focus
  // goes to the toggle rather than <body>. While a dialog is open it waits,
  // because that dialog gives focus back when it closes, or tries to.
  const refocusIfLost = useCallback(() => {
    const item = lastItemRef.current;
    if (!item || item.isConnected || document.querySelector("dialog[open]")) return;
    lastItemRef.current = null;
    const active = document.activeElement;
    if (active === null || active === document.body) toggleRef.current?.focus({ preventScroll: true });
  }, []);

  // After a re-render (the row changed while focus was in the panel).
  useEffect(() => {
    if (open) refocusIfLost();
  });

  // After a dialog closes: the lists mount ConfirmDialog outside the row,
  // and the action may have removed its opener while it was open. "close"
  // does not bubble, so this listens in the capture phase, and checks once
  // the dialog has handed focus back.
  useEffect(() => {
    if (!open) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onClose = () => {
      clearTimeout(timer);
      timer = setTimeout(refocusIfLost, 0);
    };
    document.addEventListener("close", onClose, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("close", onClose, true);
    };
  }, [open, refocusIfLost]);

  // Down to one action: the plain button again, and closed if it comes back.
  useEffect(() => {
    if (!isMenu && open) setOpen(false);
  }, [isMenu, open]);

  if (!isMenu) return <>{children}</>;

  const toggleId = `${id}-toggle`;
  const panelId = `${id}-panel`;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape" || !open) return;
    // A dialog opened inside the panel handles its own Escape.
    const dialog = e.target instanceof Element ? e.target.closest("dialog") : null;
    if (dialog && e.currentTarget.contains(dialog)) return;
    // Only this menu closes, not a dialog the list sits in.
    e.preventDefault();
    close("escape");
  }

  return (
    <div ref={rootRef} className="row-menu" onKeyDown={onKeyDown}>
      <button
        ref={toggleRef}
        id={toggleId}
        type="button"
        className="btn btn--outline btn--sm row-menu__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close("toggle") : setOpen(true))}
      >
        Actions
        {/* A no-break space: .sr-only is absolutely positioned, so a plain
            leading space collapses and the name read "Actionsfor order #123"
            (as in ConsoleNav and Chart). */}
        <span className="sr-only">{` for ${label}`}</span>
        <Icon name="chevron-down" />
      </button>
      <div
        ref={panelRef}
        id={panelId}
        className="row-menu__panel"
        role="group"
        aria-labelledby={toggleId}
        hidden={!open}
        onFocus={(e) => {
          lastItemRef.current = e.target;
        }}
        onBlur={(e) => {
          const next = e.relatedTarget;
          // Into a dialog this item opened: focus comes back here when it closes.
          if (next instanceof Element && next.closest("dialog")) return;
          if (next instanceof Node && !rootRef.current?.contains(next)) lastItemRef.current = null;
        }}
      >
        {children}
      </div>
    </div>
  );
}

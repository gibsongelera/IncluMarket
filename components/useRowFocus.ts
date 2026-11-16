import { useEffect, useRef } from "react";

/** The control a row's actions start at: the Actions toggle, or the row's single button. */
function actionControl(row: Element | null): HTMLElement | null {
  const cell = row?.querySelector("td.cell-actions");
  if (!cell) return null;
  return cell.querySelector<HTMLElement>(".row-menu__toggle") ?? cell.querySelector<HTMLElement>("button, a[href]");
}

/** Focus has nowhere to be: on <body>, or on a node a re-render removed. */
function focusLost(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected;
}

/**
 * Where focus goes after a row action changes the list (the admin lists,
 * P2-07, P2-08, P2-10). An action that takes a row off the current tab
 * (Approve on Pending, a return settled on Returns, an order cancelled on
 * In progress) re-renders the list without it once router.refresh() lands,
 * and focus would fall to <body>. Then it goes to the Actions of the row now
 * in that place, else the one before it, else the empty state's sentence
 * (emptyRef: it says why the list is empty, which a link or the count would
 * skip). A row still on the list keeps focus: RowActions puts it on its own
 * toggle first (children's effects run before this one).
 *
 * Call mark(id) before the action's await (the refreshed rows can arrive
 * before it resolves) and clear() when it fails.
 */
export function useRowFocus(rows: readonly { id: number }[]) {
  const decided = useRef<{ id: number; index: number } | null>(null);
  const emptyRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const after = decided.current;
    if (!after) return;

    const place = () => {
      decided.current = null;
      if (!focusLost()) return;
      if (rows.length) {
        const still = rows.findIndex((r) => r.id === after.id);
        const at = still >= 0 ? still : Math.min(Math.max(after.index, 0), rows.length - 1);
        const row = document.querySelector<HTMLElement>(`tr[data-row-id="${rows[at].id}"]`);
        const control = actionControl(row);
        if (control) return control.focus();
        // The row stayed but has no step left (an order delivered or
        // cancelled on All): the row itself, as DeepLinkFocus does, so focus
        // stays where the action was. Its :focus style is the deep-link one.
        if (row) {
          if (!row.hasAttribute("tabindex")) row.setAttribute("tabindex", "-1");
          row.focus();
        }
        return;
      }
      emptyRef.current?.focus();
    };

    // A dialog still open hands focus back when it closes, perhaps to a
    // button this refresh removed: place it after that.
    if (!document.querySelector("dialog[open]")) return place();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onClose = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (decided.current === after) place();
      }, 0);
    };
    document.addEventListener("close", onClose, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("close", onClose, true);
    };
  }, [rows]);

  return {
    emptyRef,
    mark(id: number) {
      decided.current = { id, index: rows.findIndex((r) => r.id === id) };
    },
    clear() {
      decided.current = null;
    },
  };
}

"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Scrolls to, highlights and focuses the row named by a `?focus=` parameter.
 *
 * The dashboard search sends you to a list page with a specific record in
 * mind. Landing at the top of a 40-row table and leaving the user to find it
 * is not "navigation" — so the target row gets scrolled into view, flashed,
 * and given keyboard focus.
 *
 * Focus, not just scroll: a screen reader or keyboard user gets nothing from a
 * scroll position. Moving focus is what actually tells them where they landed.
 *
 * Rows opt in by carrying `data-row-id`.
 */
export function DeepLinkFocus({
  /** Query parameter to read. Defaults to "focus". */
  param = "focus",
}: {
  param?: string;
}) {
  const searchParams = useSearchParams();
  const target = searchParams.get(param);

  useEffect(() => {
    if (!target) return;

    // The list may still be rendering when this runs; retry briefly.
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;

    const find = () => {
      const el = document.querySelector<HTMLElement>(
        `[data-row-id="${CSS.escape(target)}"]`
      );

      if (!el) {
        if (attempts++ < 10) timer = setTimeout(find, 100);
        return;
      }

      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("is-deeplinked");

      // Make the row focusable only for as long as it needs to be, so it does
      // not become a permanent extra tab stop.
      const hadTabIndex = el.hasAttribute("tabindex");
      if (!hadTabIndex) el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });

      timer = setTimeout(() => {
        el.classList.remove("is-deeplinked");
        if (!hadTabIndex) el.removeAttribute("tabindex");
      }, 2600);
    };

    find();
    return () => clearTimeout(timer);
  }, [target, param]);

  return null;
}

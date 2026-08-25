"use client";

import { useEffect } from "react";

/**
 * Publishes measured layout heights as CSS custom properties.
 *
 *   --header-total   the sticky header, including the user strip
 *   --commit-bar-h   the fixed bottom action bar on a page that has one
 *                    (product detail, cart, checkout), or 0px
 *
 * Both are measured rather than assumed, because both genuinely vary: the
 * header contains the search box and user strip, and the commit bar wraps to
 * two rows once its buttons no longer fit on one. Both also grow with the
 * accessibility toolbar, which scales the root font between 12px and 24px.
 *
 * Hardcoding either is the bug this component exists to prevent. The sticky
 * filter panel used `top: 84px` against a header that is ~92px at the default
 * font and over 120px at 24px, so it sat tucked underneath permanently. The
 * first version of the commit bar repeated the mistake with a 72px guess, and
 * the chat button landed on top of "Add to cart".
 */

const COMMIT_BAR_SELECTOR = ".pd__actions, .cart-summary--sticky";

export function HeaderMetrics() {
  useEffect(() => {
    const root = document.documentElement;

    const measure = () => {
      const header = document.querySelector<HTMLElement>(".site-header");
      if (header) {
        const height = Math.round(header.getBoundingClientRect().height);
        if (height > 0) root.style.setProperty("--header-total", `${height}px`);
      }

      // Only counts while the bar is actually fixed to the bottom edge, i.e.
      // on phones. On desktop the same element sits in the normal flow and
      // must not reserve any space.
      const bar = document.querySelector<HTMLElement>(COMMIT_BAR_SELECTOR);
      const isPinned = bar ? getComputedStyle(bar).position === "fixed" : false;
      const barHeight = isPinned && bar ? Math.round(bar.getBoundingClientRect().height) : 0;
      root.style.setProperty("--commit-bar-h", `${barHeight}px`);
    };

    measure();

    window.addEventListener("resize", measure);

    // The header and the bar reflow when the font scale changes or their
    // buttons wrap; ResizeObserver catches both without polling.
    const observed = [
      document.querySelector<HTMLElement>(".site-header"),
      document.querySelector<HTMLElement>(COMMIT_BAR_SELECTOR),
    ].filter(Boolean) as HTMLElement[];

    const resizeObserver = new ResizeObserver(measure);
    for (const el of observed) resizeObserver.observe(el);

    // data-font-px / data-contrast are set on <html> by the accessibility panel.
    const mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(root, {
      attributes: true,
      attributeFilter: ["data-font-px", "data-contrast", "style"],
    });

    return () => {
      window.removeEventListener("resize", measure);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      root.style.setProperty("--commit-bar-h", "0px");
    };
  }, []);

  return null;
}

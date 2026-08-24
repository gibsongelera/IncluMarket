"use client";

import { useEffect } from "react";

/**
 * Publishes the real rendered header height as `--header-total`.
 *
 * The sticky filter panel and checkout summary were pinned with a literal
 * `top: 84px`, against a header that is ~92px tall at the default font size —
 * so they sat tucked under it by about 8px permanently. At the accessibility
 * toolbar's 24px setting the header grows past 120px while the offset stays
 * frozen, and the panel disappears behind it entirely.
 *
 * Measuring is the only correct answer here, because the header contains the
 * search box and user strip and its height genuinely varies with content and
 * font size. Re-measures on resize and on any change to the root font size or
 * theme attributes, which is what lib/a11y/prefs.ts mutates.
 */
export function HeaderMetrics() {
  useEffect(() => {
    const root = document.documentElement;

    const measure = () => {
      const header = document.querySelector<HTMLElement>(".site-header");
      if (!header) return;
      const height = Math.round(header.getBoundingClientRect().height);
      if (height > 0) root.style.setProperty("--header-total", `${height}px`);
    };

    measure();

    window.addEventListener("resize", measure);

    // The header itself reflows when the font scale changes or the search box
    // wraps; ResizeObserver catches both without polling.
    const header = document.querySelector<HTMLElement>(".site-header");
    const resizeObserver = header ? new ResizeObserver(measure) : null;
    if (header && resizeObserver) resizeObserver.observe(header);

    // data-font-px / data-contrast are set on <html> by the accessibility panel.
    const mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(root, {
      attributes: true,
      attributeFilter: ["data-font-px", "data-contrast", "style"],
    });

    return () => {
      window.removeEventListener("resize", measure);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return null;
}

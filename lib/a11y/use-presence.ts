"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "./prefs";

/** Exit is shorter than the enter (M-04): 120 ms against 160 ms. */
export const EXIT_MS = 120;

/**
 * Keeps a closing popover mounted for its short exit transition (M-04).
 * While `closing` is true the panel should carry data-state="closing" and
 * `inert`, so it can neither be clicked nor reached by a screen reader on
 * its way out. With reduced motion on, it unmounts at once.
 */
export function usePresence(open: boolean): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    if (prefersReducedMotion()) {
      setMounted(false);
      return;
    }
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open, mounted]);

  return { mounted: open || mounted, closing: !open && mounted };
}

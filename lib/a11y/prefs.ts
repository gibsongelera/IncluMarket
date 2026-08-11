/** Pure accessibility preference helpers (client + smoke-testable). */

export const FONT_SIZES = [12, 14, 16, 18, 20, 22, 24] as const;
export type FontSizePx = (typeof FONT_SIZES)[number];

export const A11Y_KEYS = {
  fontSize: "im_font_size_px",
  contrast: "im_high_contrast",
  reduceMotion: "im_reduce_motion",
  tts: "im_tts_enabled",
  voice: "im_voice_commands",
  reading: "im_reading_mode",
  highlight: "im_highlight_read",
  speechRate: "im_speech_rate",
  visualAlerts: "im_visual_alerts",
  largeCursors: "im_large_cursors",
} as const;

export function clampFontSize(n: number): FontSizePx {
  const stepped = Math.round(n / 2) * 2;
  const clamped = Math.min(24, Math.max(12, stepped));
  return (FONT_SIZES.includes(clamped as FontSizePx) ? clamped : 16) as FontSizePx;
}

export function nextFontSize(current: number, delta: number): FontSizePx {
  return clampFontSize(current + delta);
}

export function parseStoredFontSize(raw: string | null): FontSizePx {
  if (!raw) return 16;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 16;
  return clampFontSize(n);
}

export function applyFontSizePx(px: FontSizePx) {
  if (typeof document === "undefined") return;
  document.documentElement.style.fontSize = `${px}px`;
  document.documentElement.setAttribute("data-font-px", String(px));
}

export function applyHighContrast(on: boolean) {
  if (typeof document === "undefined") return;
  if (on) document.documentElement.setAttribute("data-contrast", "high");
  else document.documentElement.removeAttribute("data-contrast");
  if (typeof document !== "undefined") {
    document.cookie = `im_contrast=${on ? "high" : "default"};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
  }
}

export function applyReduceMotion(on: boolean) {
  if (typeof document === "undefined") return;
  if (on) document.documentElement.setAttribute("data-reduce-motion", "true");
  else document.documentElement.removeAttribute("data-reduce-motion");
}

export function applyLargeCursors(on: boolean) {
  if (typeof document === "undefined") return;
  if (on) document.documentElement.setAttribute("data-large-cursors", "true");
  else document.documentElement.removeAttribute("data-large-cursors");
}

export function applyReadingMode(on: boolean) {
  if (typeof document === "undefined") return;
  if (on) document.documentElement.setAttribute("data-reading-mode", "true");
  else document.documentElement.removeAttribute("data-reading-mode");
}

/** Match IncluMarket-style voice command phrases to routes / actions. */
export type VoiceAction =
  | { type: "navigate"; href: string }
  | { type: "speak"; text: string }
  | { type: "scroll"; direction: "up" | "down" | "top" }
  | { type: "focus-search" }
  | { type: "stop" }
  | { type: "help" }
  | { type: "back" }
  | null;

export function matchVoiceCommand(utterance: string): VoiceAction {
  const t = utterance.toLowerCase().trim();
  if (!t) return null;
  if (/\b(stop|quiet|silence)\b/.test(t)) return { type: "stop" };
  if (/\bhelp\b/.test(t)) return { type: "help" };
  if (/\b(go )?back\b/.test(t)) return { type: "back" };
  if (/\b(go )?(home|homepage)\b/.test(t)) return { type: "navigate", href: "/home" };
  if (/\b(catalog|products|shop)\b/.test(t)) return { type: "navigate", href: "/home" };
  if (/\bcart\b/.test(t)) return { type: "navigate", href: "/buyer/cart" };
  if (/\bcheckout\b/.test(t)) return { type: "navigate", href: "/buyer/checkout" };
  if (/\bwishlist\b/.test(t)) return { type: "navigate", href: "/buyer/wishlist" };
  if (/\b(orders|my orders)\b/.test(t)) return { type: "navigate", href: "/buyer/orders" };
  if (/\bsearch\b/.test(t)) return { type: "focus-search" };
  if (/\b(scroll )?up\b/.test(t)) return { type: "scroll", direction: "up" };
  if (/\b(scroll )?down\b/.test(t)) return { type: "scroll", direction: "down" };
  if (/\b(go to )?top\b/.test(t)) return { type: "scroll", direction: "top" };
  if (/\bread (the )?title\b/.test(t)) {
    return { type: "speak", text: typeof document !== "undefined" ? document.title : "IncluMarket" };
  }
  if (/\bread (the )?page\b/.test(t)) {
    const text =
      typeof document !== "undefined"
        ? (document.getElementById("main")?.innerText || document.body?.innerText || "").slice(0, 1200)
        : "";
    return { type: "speak", text: text || "No page content found." };
  }
  return null;
}

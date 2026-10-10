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

/**
 * Whether to skip motion: the OS setting or the toolbar Reduce motion switch.
 * CSS honours both for animations; JS smooth scrolling has to ask (M-01).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  if (document.documentElement.getAttribute("data-reduce-motion") === "true") return true;
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** "smooth", unless the person asked for less motion. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
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

/**
 * Whether voice commands can run at all.
 *
 * Both answers have to be distinguishable in the UI. Silently doing nothing is
 * what made the toggle look broken: Firefox has no SpeechRecognition, and the
 * API is also gated on a secure context, so a phone hitting the dev server at
 * http://192.168.x.x gets an object that errors the instant it starts.
 */
export type VoiceSupport = "ready" | "unsupported" | "insecure";

export function checkVoiceSupport(scope: {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
  isSecureContext?: boolean;
}): VoiceSupport {
  if (!scope.SpeechRecognition && !scope.webkitSpeechRecognition) return "unsupported";
  if (scope.isSecureContext === false) return "insecure";
  return "ready";
}

/**
 * Split Web Speech error codes into "retry" and "stop and explain".
 *
 * Restarting on a fatal code is an infinite loop: the browser ends the session
 * immediately, onend fires, the restart raises the same error. `no-speech` and
 * `aborted`, by contrast, are the normal way a continuous session ends and
 * must be retried or recognition dies after the first pause.
 */
export function classifyVoiceError(code: string): { fatal: boolean; message: string } {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return {
        fatal: true,
        message:
          "Microphone access is blocked. Allow the microphone for this site in your browser settings, then switch voice commands on again.",
      };
    case "audio-capture":
      return {
        fatal: true,
        message: "No microphone was found. Connect one, then switch voice commands on again.",
      };
    case "network":
      return {
        fatal: true,
        message: "Speech recognition could not reach the browser's speech service. Check your connection.",
      };
    case "language-not-supported":
      return { fatal: true, message: "This browser cannot recognise the language used for commands." };
    default:
      // no-speech, aborted, and anything unknown: let onend retry.
      return { fatal: false, message: "" };
  }
}

/** Match inclumarket-style voice command phrases to routes / actions. */
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
    return { type: "speak", text: typeof document !== "undefined" ? document.title : "InclusiveMarket" };
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

// Theme presets + CSS-variable resolution.
// Admin Theme customizer edits a global im_theme_settings row; resolved
// CSS custom properties are injected as a <style> block by the root layout so
// buyer / seller / admin chrome all update together.

import type { ThemeSettings } from "./types";

export interface ThemePreset {
  id: string;
  label: string;
  description: string;
  swatches: string[];
  vars: Record<string, string>;
}

/** Every CSS custom property a theme may set — used to clear stale inline overrides. */
export const THEME_VAR_KEYS = [
  "--palette-primary",
  "--palette-primary-dark",
  "--palette-deep",
  "--palette-olive",
  "--palette-forest",
  "--palette-primary-100",
  "--palette-deep-100",
  "--palette-olive-100",
  "--palette-forest-100",
  "--brand-yellow",
  "--brand-yellow-800",
  "--brand-red-800",
  "--brand-blue",
  "--brand-blue-800",
  "--brand-blue-100",
  "--brand-red",
  "--brand-red-100",
  "--success",
  "--success-100",
  "--warning",
  "--warning-100",
  "--danger",
  "--danger-100",
  "--info",
  "--info-100",
  "--focus-ring",
  "--color-nav",
  "--color-nav-text",
  "--color-body",
  "--color-body-bg",
  "--color-footer",
  "--color-footer-text",
  "--text-charcoal",
  "--text-muted",
  "--text-heading",
  "--text-on-canvas",
  "--text-on-canvas-muted",
  "--text-on-canvas-shadow",
  "--text-on-canvas-link",
] as const;

/**
 * Shared brand aliases derived from palette tokens.
 * Applied for every preset so buttons, links, badges, and pills follow the theme.
 */
function brandAliases(): Record<string, string> {
  return {
    "--brand-blue": "var(--palette-primary-dark)",
    "--brand-blue-800": "var(--palette-deep)",
    "--brand-blue-100": "var(--palette-deep-100)",
    "--brand-red": "#C41E3A",
    "--brand-red-100": "#FCE8EC",
    "--success": "var(--palette-forest)",
    "--success-100": "var(--palette-forest-100)",
    "--warning": "var(--palette-olive)",
    "--warning-100": "var(--palette-olive-100)",
    "--danger": "#C41E3A",
    "--danger-100": "#FCE8EC",
    "--info": "var(--palette-primary-dark)",
    "--info-100": "var(--palette-deep-100)",
    "--focus-ring": "3px solid var(--palette-primary-dark)",
  };
}

/**
 * Event-theme text colors: deep complementary tones readable on the light body,
 * so names / headings are clearly themed (not flat charcoal-black).
 * Default theme intentionally omits these so tokens.css (#212529 / #5A6169) stay as-is.
 */
function eventText(deep: string, muted: string, heading?: string): Record<string, string> {
  const h = heading || deep;
  return {
    "--text-charcoal": deep,
    "--text-muted": muted,
    "--text-heading": h,
    /* Solid light event bodies — canvas titles use the same deep themed ink */
    "--text-on-canvas": h,
    "--text-on-canvas-muted": muted,
    "--text-on-canvas-shadow": "none",
    "--text-on-canvas-link": deep,
  };
}

export const THEME_PRESETS: Record<string, ThemePreset> = {
  default: {
    id: "default",
    label: "DSWD default",
    description: "Blue · red · gold · white",
    swatches: ["#0038A8", "#C41E3A", "#F5C518", "#FFFFFF", "#0B5C3B"],
    vars: {
      "--palette-primary": "#F5C518",
      "--palette-primary-dark": "#0038A8",
      "--palette-deep": "#00287A",
      "--palette-olive": "#B8860B",
      "--palette-forest": "#0B5C3B",
      "--palette-primary-100": "#FFF6D6",
      "--palette-deep-100": "#E8EEF9",
      "--palette-olive-100": "#FFF4D1",
      "--palette-forest-100": "#D8EDE3",
      "--brand-yellow": "#F5C518",
      "--brand-yellow-800": "#B8860B",
      "--brand-red": "#C41E3A",
      "--brand-red-800": "#8E1529",
      "--brand-blue": "#0038A8",
      "--brand-blue-800": "#00287A",
      "--brand-blue-100": "#E8EEF9",
      "--color-nav": "#00287A",
      "--color-nav-text": "#FFFFFF",
      "--color-body": "#F5F7FA",
      "--color-body-bg": "linear-gradient(160deg,#E8EEF9 0%,#F5F7FA 42%,#FFFFFF 100%)",
      "--color-footer": "#00205B",
      "--color-footer-text": "#F5F7FA",
      "--text-on-canvas": "#00205B",
      "--text-on-canvas-muted": "#5A6169",
      "--text-on-canvas-shadow": "none",
      "--text-on-canvas-link": "#0038A8",
    },
  },
  womens_month: {
    id: "womens_month",
    label: "Women's Month",
    description: "Pink-forward complementary",
    swatches: ["#C2185B", "#AD1457", "#6A1B4D", "#8E2448", "#2E7D6F"],
    vars: {
      "--palette-primary": "#C2185B",
      "--palette-primary-dark": "#AD1457",
      "--palette-deep": "#6A1B4D",
      "--palette-olive": "#8E2448",
      "--palette-forest": "#2E7D6F",
      "--palette-primary-100": "#FCE4EC",
      "--palette-deep-100": "#F3E5F0",
      "--palette-olive-100": "#F8E7EE",
      "--palette-forest-100": "#DFF3EF",
      "--brand-yellow": "#F48FB1",
      "--brand-yellow-800": "#8E2448",
      "--brand-red-800": "#4A0E36",
      "--color-nav": "#6A1B4D",
      "--color-nav-text": "#FFFFFF",
      "--color-body": "#FFF5F8",
      "--color-body-bg": "#FFF5F8",
      "--color-footer": "#3D102C",
      "--color-footer-text": "#FCE4EC",
      // Deep plum on blush pink — clear names/titles, not flat charcoal-black
      ...eventText("#3D102C", "#8E2448", "#6A1B4D"),
    },
  },
  pride: {
    id: "pride",
    label: "Pride Month",
    description: "Rainbow-inspired complementary",
    swatches: ["#E40303", "#FF8C00", "#5B2C6F", "#0047AB", "#009C49"],
    vars: {
      "--palette-primary": "#FF8C00",
      "--palette-primary-dark": "#E40303",
      "--palette-deep": "#5B2C6F",
      "--palette-olive": "#0047AB",
      "--palette-forest": "#009C49",
      "--palette-primary-100": "#FFF0D9",
      "--palette-deep-100": "#EDE4F3",
      "--palette-olive-100": "#DCE6F5",
      "--palette-forest-100": "#D6F3E4",
      "--brand-yellow": "#FFD100",
      "--brand-yellow-800": "#B8860B",
      "--brand-red-800": "#3D1C4A",
      "--color-nav": "#5B2C6F",
      "--color-nav-text": "#FFFFFF",
      "--color-body": "#FFF8F0",
      "--color-body-bg": "#FFF8F0",
      "--color-footer": "#2A1638",
      "--color-footer-text": "#F3E9FF",
      ...eventText("#2A1638", "#5B2C6F", "#5B2C6F"),
    },
  },
  independence: {
    id: "independence",
    label: "Independence Day",
    description: "June 12 — blue · red · gold",
    swatches: ["#0038A8", "#CE1126", "#0A1F5C", "#FCD116", "#0B5C3B"],
    vars: {
      "--palette-primary": "#CE1126",
      "--palette-primary-dark": "#A50E1E",
      "--palette-deep": "#0038A8",
      "--palette-olive": "#B8860B",
      "--palette-forest": "#0B5C3B",
      "--palette-primary-100": "#FDE3E6",
      "--palette-deep-100": "#DCE6F7",
      "--palette-olive-100": "#FFF6D6",
      "--palette-forest-100": "#D8EFE4",
      "--brand-yellow": "#FCD116",
      "--brand-yellow-800": "#B8860B",
      "--brand-red-800": "#7A0A16",
      "--color-nav": "#0038A8",
      "--color-nav-text": "#FFFFFF",
      "--color-body": "#F5F8FF",
      "--color-body-bg": "#F5F8FF",
      "--color-footer": "#0A1F5C",
      "--color-footer-text": "#FCD116",
      ...eventText("#0A1F5C", "#0038A8", "#0038A8"),
    },
  },
  christmas: {
    id: "christmas",
    label: "Christmas",
    description: "Evergreen · berry · gold",
    swatches: ["#C41E3A", "#8B0000", "#0B3D2E", "#B8860B", "#145A32"],
    vars: {
      "--palette-primary": "#C41E3A",
      "--palette-primary-dark": "#8B0000",
      "--palette-deep": "#0B3D2E",
      "--palette-olive": "#B8860B",
      "--palette-forest": "#145A32",
      "--palette-primary-100": "#FDE6EA",
      "--palette-deep-100": "#D9EBE3",
      "--palette-olive-100": "#FFF4D6",
      "--palette-forest-100": "#D8EFDF",
      "--brand-yellow": "#F0D060",
      "--brand-yellow-800": "#B8860B",
      "--brand-red-800": "#5C0000",
      "--color-nav": "#0B3D2E",
      "--color-nav-text": "#FFFFFF",
      "--color-body": "#F7FBF8",
      "--color-body-bg": "#F7FBF8",
      "--color-footer": "#06261C",
      "--color-footer-text": "#F0D060",
      ...eventText("#06261C", "#0B3D2E", "#0B3D2E"),
    },
  },
  holy_week: {
    id: "holy_week",
    label: "Holy Week / Lent",
    description: "Violet · ash · olive",
    swatches: ["#6B4C9A", "#4A2C6A", "#3D2B1F", "#6B5B2A", "#2F5D50"],
    vars: {
      "--palette-primary": "#6B4C9A",
      "--palette-primary-dark": "#4A2C6A",
      "--palette-deep": "#3D2B1F",
      "--palette-olive": "#6B5B2A",
      "--palette-forest": "#2F5D50",
      "--palette-primary-100": "#EDE6F5",
      "--palette-deep-100": "#E8E0D8",
      "--palette-olive-100": "#F0ECD4",
      "--palette-forest-100": "#D8EBE5",
      "--brand-yellow": "#D4C48A",
      "--brand-yellow-800": "#6B5B2A",
      "--brand-red-800": "#2A1C14",
      "--color-nav": "#3D2B1F",
      "--color-nav-text": "#FFFFFF",
      "--color-body": "#F7F4EF",
      "--color-body-bg": "#F7F4EF",
      "--color-footer": "#241912",
      "--color-footer-text": "#EDE6F5",
      ...eventText("#241912", "#4A2C6A", "#3D2B1F"),
    },
  },
  buwan_ng_wika: {
    id: "buwan_ng_wika",
    label: "Buwan ng Wika",
    description: "Language month — warm gold · earth",
    swatches: ["#D4A017", "#B8860B", "#5C3317", "#6B4F1D", "#1B5E4B"],
    vars: {
      "--palette-primary": "#D4A017",
      "--palette-primary-dark": "#B8860B",
      "--palette-deep": "#5C3317",
      "--palette-olive": "#6B4F1D",
      "--palette-forest": "#1B5E4B",
      "--palette-primary-100": "#FFF4D4",
      "--palette-deep-100": "#F0E4D8",
      "--palette-olive-100": "#F3ECD4",
      "--palette-forest-100": "#D6EFE7",
      "--brand-yellow": "#F5D76E",
      "--brand-yellow-800": "#6B4F1D",
      "--brand-red-800": "#3D220F",
      "--color-nav": "#5C3317",
      "--color-nav-text": "#FFFFFF",
      "--color-body": "#FFFBF0",
      "--color-body-bg": "#FFFBF0",
      "--color-footer": "#2E1A0C",
      "--color-footer-text": "#FFF4D4",
      ...eventText("#2E1A0C", "#6B4F1D", "#5C3317"),
    },
  },
  pwd_awareness: {
    id: "pwd_awareness",
    label: "PWD / Disability Rights",
    description: "Awareness blue · teal · gold",
    swatches: ["#0077C8", "#005A9C", "#003D6B", "#6B5B00", "#00857C"],
    vars: {
      "--palette-primary": "#0077C8",
      "--palette-primary-dark": "#005A9C",
      "--palette-deep": "#003D6B",
      "--palette-olive": "#6B5B00",
      "--palette-forest": "#00857C",
      "--palette-primary-100": "#D9EFFA",
      "--palette-deep-100": "#D6E4F0",
      "--palette-olive-100": "#F5F0D0",
      "--palette-forest-100": "#D4F0ED",
      "--brand-yellow": "#F0D060",
      "--brand-yellow-800": "#6B5B00",
      "--brand-red-800": "#00284A",
      "--color-nav": "#003D6B",
      "--color-nav-text": "#FFFFFF",
      "--color-body": "#F3F9FC",
      "--color-body-bg": "#F3F9FC",
      "--color-footer": "#00284A",
      "--color-footer-text": "#D9EFFA",
      ...eventText("#00284A", "#005A9C", "#003D6B"),
    },
  },
};

export function getThemePreset(id?: string | null): ThemePreset {
  return THEME_PRESETS[id || "default"] || THEME_PRESETS.default;
}

export function getThemePresets(): ThemePreset[] {
  return Object.keys(THEME_PRESETS).map((k) => THEME_PRESETS[k]);
}

/** Clear every theme custom property from an element's inline style. */
export function clearInlineThemeVars(root: CSSStyleDeclaration | { removeProperty(k: string): void }) {
  THEME_VAR_KEYS.forEach((k) => root.removeProperty(k));
}

/** Apply a full resolved var map to documentElement (client live preview). */
export function applyInlineThemeVars(vars: Record<string, string>) {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  clearInlineThemeVars(root);
  Object.entries(vars).forEach(([k, v]) => root.setProperty(k, v));
}

// Resolve the effective CSS custom properties for a stored settings row,
// applying any per-chrome overrides. Always merges brand aliases so UI chrome
// (buttons, links, badges) tracks the active palette.
export function resolveThemeVars(
  settings?: Partial<ThemeSettings> | null
): Record<string, string> {
  const preset = getThemePreset(settings?.theme_preset);
  const vars: Record<string, string> = {
    ...preset.vars,
    ...brandAliases(),
  };
  if (settings?.color_nav) vars["--color-nav"] = settings.color_nav;
  if (settings?.color_body) {
    vars["--color-body"] = settings.color_body;
    vars["--color-body-bg"] = settings.color_body; // solid override replaces rainbow bg
  }
  if (settings?.color_footer) vars["--color-footer"] = settings.color_footer;
  if (settings?.color_nav_text) vars["--color-nav-text"] = settings.color_nav_text;
  if (settings?.color_footer_text)
    vars["--color-footer-text"] = settings.color_footer_text;
  if (!vars["--color-body-bg"] && vars["--color-body"])
    vars["--color-body-bg"] = vars["--color-body"];

  // Default theme: keep tokens.css charcoal/muted/heading for cards & body text.
  // Canvas title vars (--text-on-canvas*) stay so rainbow page titles remain white.
  if (preset.id === "default") {
    delete vars["--text-charcoal"];
    delete vars["--text-muted"];
    delete vars["--text-heading"];
  }

  return vars;
}

// Serialize resolved vars into a CSS string for the layout's <style> tag.
// Selector `html:root` (specificity 0,1,1) intentionally outranks tokens.css's
// plain `:root` (0,1,0) so the active theme wins regardless of stylesheet order,
// while `:root[data-contrast="high"]` (0,2,0) still overrides for a11y mode.
export function themeVarsToCss(vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join("");
  return `html:root{${body}}`;
}

// Theme presets + CSS-variable resolution, ported verbatim from assets/js/ui.js.
// The admin Theme customizer edits a global im_theme_settings row; the resolved
// CSS custom properties are injected as a <style> block by the root layout so
// buyer / seller / admin chrome all update together (no flash of default theme).

import type { ThemeSettings } from "./types";

export interface ThemePreset {
  id: string;
  label: string;
  description: string;
  swatches: string[];
  vars: Record<string, string>;
}

export const THEME_PRESETS: Record<string, ThemePreset> = {
  default: {
    id: "default",
    label: "Inklu default",
    description: "Orange · burgundy · olive · forest",
    swatches: ["#D46E00", "#C55501", "#711402", "#695A07", "#136533"],
    vars: {
      "--palette-primary": "#D46E00",
      "--palette-primary-dark": "#C55501",
      "--palette-deep": "#711402",
      "--palette-olive": "#695A07",
      "--palette-forest": "#136533",
      "--palette-primary-100": "#FCE8D4",
      "--palette-deep-100": "#F3E4E0",
      "--palette-olive-100": "#F0ECD4",
      "--palette-forest-100": "#D8EDE3",
      "--brand-yellow": "#F0C36A",
      "--brand-yellow-800": "#695A07",
      "--brand-red-800": "#4A0D01",
      "--color-nav": "#711402",
      "--color-nav-text": "#FFFFFF",
      "--color-body": "#5D9D8A",
      "--color-body-bg":
        "linear-gradient(90deg,#781838 0%,#551547 7.7%,#301658 15.4%,#121B69 23.1%,#234075 30.8%,#417080 38.5%,#5D9D8A 46.2%,#75B485 53.8%,#8DA062 61.5%,#B28C42 69.2%,#DF7B30 76.9%,#D26F2C 84.6%,#C36227 92.3%,#B45623 100%)",
      "--color-footer": "#2A1A12",
      "--color-footer-text": "#F8F1EA",
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
    },
  },
};

export function getThemePreset(id?: string | null): ThemePreset {
  return THEME_PRESETS[id || "default"] || THEME_PRESETS.default;
}

export function getThemePresets(): ThemePreset[] {
  return Object.keys(THEME_PRESETS).map((k) => THEME_PRESETS[k]);
}

// Resolve the effective CSS custom properties for a stored settings row,
// applying any per-chrome overrides exactly like the original applyThemeFromPref.
export function resolveThemeVars(
  settings?: Partial<ThemeSettings> | null
): Record<string, string> {
  const preset = getThemePreset(settings?.theme_preset);
  const vars: Record<string, string> = { ...preset.vars };
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

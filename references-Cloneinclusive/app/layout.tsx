import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/styles/components.css";
import "@/styles/layout.css";
import "@/styles/shopee.css";
import "@/styles/landing.css";

import type { Metadata } from "next";
import { getThemeSettings } from "@/lib/data";
import { getContrast } from "@/lib/session";
import { resolveThemeVars, themeVarsToCss } from "@/lib/theme";
import { Toaster } from "@/components/Toaster";

export const metadata: Metadata = {
  title: "InkluMarket — PWD Livelihood Marketplace",
  description:
    "InkluMarket — a Shopee-style e-commerce module for PWD livelihood under the InkluTrack ecosystem. Built on DSWD identity and WCAG 2.1 AA.",
};

// Theme + contrast are request-time; avoid static prerender crashing when
// SUPABASE_SERVICE_ROLE_KEY is absent at build (e.g. Vercel before env is wired).
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let theme = null;
  let contrast: "default" | "high" = "default";
  try {
    [theme, contrast] = await Promise.all([getThemeSettings(), getContrast()]);
  } catch {
    // Missing env / DB during build or cold start — fall back to default theme.
  }
  const vars = resolveThemeVars(theme);
  const css = themeVarsToCss(vars);

  return (
    <html lang="en" data-contrast={contrast === "high" ? "high" : undefined}>
      <head>
        <meta name="theme-color" content={vars["--color-nav"] || "#711402"} />
        <style id="im-theme" dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}

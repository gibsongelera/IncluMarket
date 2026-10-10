import "@fortawesome/fontawesome-svg-core/styles.css";
import "@/lib/fontawesome";
import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/styles/components.css";
import "@/styles/layout.css";
import "@/styles/shopee.css";
import "@/styles/landing.css";
// Imported last: owns every width media query and adjusts the layers above it.
import "@/styles/responsive.css";

import type { Metadata } from "next";
import { getThemeSettings } from "@/lib/data";
import { getContrast } from "@/lib/session";
import { resolveThemeVars, themeVarsToCss } from "@/lib/theme";
import { Toaster } from "@/components/Toaster";
import { ChatWidget } from "@/components/ChatWidget";
import { AccessibilityWidget } from "@/components/AccessibilityWidget";
import { VisualAlertHost } from "@/components/VisualAlert";
import { HeaderMetrics } from "@/components/HeaderMetrics";
import { bodyFont, displayFont } from "./fonts";

export const metadata: Metadata = {
  title: {
    default: "InclusiveMarket — products made by PWD trainees of AVRC Region IX",
    template: "%s — InclusiveMarket",
  },
  description:
    "Buy bags, apparel, crafts, food and more made by persons with disabilities trained at AVRC Region IX. Accessible by design. Part of the InkluTrack ecosystem.",
  applicationName: "InclusiveMarket",
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
    <html
      lang="en"
      className={`${bodyFont.variable} ${displayFont.variable}`}
      data-contrast={contrast === "high" ? "high" : undefined}>
      <head>
        <meta name="theme-color" content={vars["--color-nav"] || "#0038A8"} />
        <style id="im-theme" dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        {children}
        <HeaderMetrics />
        <Toaster />
        <VisualAlertHost />
        <ChatWidget />
        <AccessibilityWidget />
      </body>
    </html>
  );
}

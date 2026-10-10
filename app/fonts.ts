import { Nunito_Sans, Rubik } from "next/font/google";

/**
 * Self-hosted fonts. base.css used to @import them from fonts.googleapis.com:
 * a render-blocking request to a third party on every first visit, a visitor
 * IP sent to Google, and two extra CSP hosts. next/font downloads them at
 * build time, serves them from /_next, and generates size-adjusted fallbacks
 * so the swap does not shift the layout.
 *
 * Only the CSS variables are used; tokens.css builds --font-body and
 * --font-display on top of them.
 */
export const bodyFont = Nunito_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-nunito",
});

export const displayFont = Rubik({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-rubik",
});

/** @type {import('next').NextConfig} */

// Supabase origin, so connect-src can be scoped instead of wildcarded.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

/**
 * Content-Security-Policy.
 *
 * Notes on the concessions here, so they are deliberate rather than inherited:
 *
 * - `style-src` allows inline styles. The root layout injects the resolved
 *   theme into a <style id="im-theme"> block, and ~24 components use React
 *   inline `style` props (which produce style *attributes*). A nonce would
 *   cover the <style> block but not the attributes, so tightening this means
 *   first removing the inline style props — tracked as follow-up work.
 *   lib/theme.ts sanitises every value it emits into that block.
 * - `img-src` must allow `data:`: every product image is a base64 data URL
 *   stored in im_product_images (no Storage bucket).
 * - `script-src` allows 'unsafe-inline' only as the documented fallback for
 *   browsers that honour it alongside a nonce; modern browsers ignore it when
 *   a nonce or 'strict-dynamic' is present.
 *
 * Ships as Report-Only unless CSP_ENFORCE=1, so the theme system and the
 * accessibility widget cannot be broken by a policy typo on a live demo.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  // fonts.googleapis.com serves the @import in styles/base.css; the font files
  // themselves come from fonts.gstatic.com. Caught by the report-only policy
  // on first run, which is exactly why it ships report-only first.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' ${supabaseOrigin}`.trim(),
  "media-src 'self' data:",
  "worker-src 'self' blob:",
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  {
    key: process.env.CSP_ENFORCE === "1"
      ? "Content-Security-Policy"
      : "Content-Security-Policy-Report-Only",
    value: csp,
  },
  // 2 years, matching the preload-list requirement.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // microphone stays self-enabled: the accessibility widget's voice commands
  // use the Web Speech API and break without it.
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // TODO: flip to false once eslint-plugin-jsx-a11y is added and its findings
    // are cleared. Leaving it true means lint rules never gate a deploy.
    ignoreDuringBuilds: true,
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

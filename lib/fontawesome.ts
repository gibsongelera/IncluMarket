import { config } from "@fortawesome/fontawesome-svg-core";

// We import the CSS ourselves in app/layout.tsx, so stop FA's runtime from
// injecting its own <style> tag (avoids an SSR/hydration flash-of-unstyled-icon).
config.autoAddCss = false;

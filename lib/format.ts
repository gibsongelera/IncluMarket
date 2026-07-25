// Formatting + placeholder helpers ported from the original assets/js/ui.js.

const PHP = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
});

export function money(n: number | string | null | undefined): string {
  return PHP.format(Number(n) || 0);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-PH", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

// Basic PII mask: j***@m***.ph
export function maskEmail(email: string | null | undefined): string {
  if (!email || email.indexOf("@") < 0) return email || "";
  const [local, domain] = email.split("@");
  const localMasked =
    local.length <= 2
      ? (local[0] || "*") + "*"
      : local[0] + "***" + local[local.length - 1];
  const domainParts = domain.split(".");
  const host = domainParts[0];
  const tld = domainParts.slice(1).join(".");
  const hostMasked = host.length <= 2 ? host[0] + "*" : host[0] + "***";
  return localMasked + "@" + hostMasked + (tld ? "." + tld : "");
}

// SVG data-URL placeholder derived from a product's emoji art (zero-dependency
// fallback, identical to the original ui.svgPlaceholder).
export function svgPlaceholder(emoji?: string | null, bg = "#F8F9FA"): string {
  const art = emoji || "\u{1F6CD}\u{FE0F}";
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet">' +
    `<rect width="400" height="400" fill="${bg}"/>` +
    '<text x="50%" y="50%" font-size="200" text-anchor="middle" dominant-baseline="central" font-family="system-ui,Segoe UI Emoji,Apple Color Emoji">' +
    art +
    "</text></svg>";
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

export function productImageSrc(
  product: { image?: string | null; images?: string[] | null } | null,
  index = 0
): string {
  if (!product) return svgPlaceholder("\u{1F6CD}\u{FE0F}");
  const arr = Array.isArray(product.images) ? product.images : [];
  if (arr.length) {
    const i = Math.max(0, Math.min(index, arr.length - 1));
    return arr[i];
  }
  return svgPlaceholder(product.image);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
}

// Formatting + placeholder helpers ported from the original assets/js/ui.js.

const PHP = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
});

export function money(n: number | string | null | undefined): string {
  return PHP.format(Number(n) || 0);
}

/**
 * Whole pesos for a dashboard figure: "₱128,430" (01 §6.1). A KPI tile in a
 * row of four has room for the figure, not its centavos; lists, receipts
 * and balances keep money(). Both digit limits are set: some runtimes throw
 * when only the maximum is below the currency's default of two.
 */
export function moneyWhole(n: number | string | null | undefined): string {
  return (Number(n) || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Dates and times are shown in Manila time wherever the code runs. Without a
 * time zone they followed the machine: the UTC server put an order placed at
 * 07:00 in Manila on the day before, and a client component formatting the
 * same value in the browser could disagree with the server-rendered text.
 */
const MANILA = "Asia/Manila";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-PH", {
      timeZone: MANILA,
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
      timeZone: MANILA,
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

/**
 * An email address cut where a line may break: after the "@" and before
 * each "." ("juan.cruz@gmail.com" → "juan", ".cruz@", "gmail", ".com").
 * Joined, the parts are the address unchanged. components/EmailText.tsx puts
 * a <wbr> between them.
 */
export function emailParts(address: string | null | undefined): string[] {
  if (!address) return [];
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < address.length; i++) {
    if (address[i] === "@") {
      parts.push(address.slice(start, i + 1));
      start = i + 1;
    } else if (address[i] === "." && i > start) {
      parts.push(address.slice(start, i));
      start = i;
    }
  }
  parts.push(address.slice(start));
  return parts.filter((p) => p !== "");
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

/**
 * "Maria Santos" → "Maria S." — how one user is shown to another (reviewer,
 * buyer on a seller's screen). Enough to recognise, not enough to look up.
 */
export function shortName(name: string | null | undefined): string {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Buyer";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

/**
 * A status in the words its pill shows (components/Pill.tsx: underscores as
 * spaces), with the first letter capitalised as the pill's CSS does:
 * "return_requested" → "Return requested". For legends, tables and labels
 * that sit outside a pill.
 */
export function statusLabel(status: string | null | undefined): string {
  const words = String(status ?? "").replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
}

/**
 * Navigation, defined once for every surface that shows it: the header links
 * (md and up), the phone tab bar and its "More" sheet (below md), and the
 * Seller Centre / Admin sidebar (lg and up). They used to keep separate
 * copies that drifted. Pure data — safe in server and client components.
 */

export type NavRole = "guest" | "buyer" | "seller" | "admin";

export interface NavItem {
  href: string;
  label: string;
  /** Key in components/Icon.tsx. Icons are decorative; the label is the name. */
  icon: string;
  /** Other path prefixes that count as "you are here". */
  match?: string[];
  /** Phone placement: one of the four tab-bar slots, or the "More" sheet. */
  mobile?: "primary" | "more";
  /**
   * The tab bar's text for a one-word label wider than its slot: the label
   * with a soft hyphen (U+00AD) at a dictionary syllable. At 320px with 24px
   * text a slot holds 58px of label and "Dashboard" is 82px, so it breaks as
   * "Dash-/board" instead of being cut off or split at any letter. Shown
   * aria-hidden; `label` stays the accessible name.
   */
  tabLabel?: string;
  /** Show among the header links (md+). */
  header?: boolean;
  /** Sidebar group heading (Seller Centre / Admin, lg+). */
  section?: string;
  /** Current only on this exact path (a section home such as /admin). */
  exact?: boolean;
}

export const NAV: Record<NavRole, NavItem[]> = {
  guest: [
    { href: "/home", label: "Shop", icon: "grid", mobile: "primary", match: ["/buyer/product", "/search", "/shop"] },
    { href: "/login", label: "Sign in", icon: "user", mobile: "primary" },
    { href: "/about", label: "About us", icon: "sparkles", mobile: "more" },
    { href: "/faq", label: "Help & FAQ", icon: "chat", mobile: "more" },
    { href: "/contact", label: "Contact", icon: "message-circle", mobile: "more" },
    { href: "/accessibility", label: "Accessibility", icon: "accessibility", mobile: "more" },
  ],
  buyer: [
    { href: "/home", label: "Shop", icon: "grid", mobile: "primary", header: true, match: ["/buyer/product", "/search", "/shop"] },
    { href: "/buyer/wishlist", label: "Wishlist", tabLabel: "Wish\u00ADlist", icon: "heart", mobile: "primary", header: true },
    { href: "/buyer/cart", label: "Cart", icon: "cart", mobile: "primary", match: ["/buyer/checkout"] },
    { href: "/buyer/orders", label: "My orders", icon: "box", mobile: "primary", header: true },
    { href: "/buyer/messages", label: "Messages", icon: "message-circle", mobile: "more", header: true },
    { href: "/buyer/support", label: "Help", icon: "chat", mobile: "more", header: true },
    { href: "/account", label: "Account", icon: "user", mobile: "more" },
  ],
  seller: [
    { href: "/seller/dashboard", label: "Dashboard", tabLabel: "Dash\u00ADboard", icon: "chart", mobile: "primary", header: true, section: "Overview" },
    { href: "/seller/products", label: "Products", tabLabel: "Prod\u00ADucts", icon: "box", mobile: "primary", header: true, section: "Shop" },
    { href: "/seller/flash-sales", label: "Flash sales", icon: "sparkles", mobile: "more", section: "Shop" },
    { href: "/seller/shop", label: "Shop settings", icon: "edit", mobile: "more", section: "Shop" },
    { href: "/seller/orders", label: "Orders", icon: "truck", mobile: "primary", header: true, section: "Sales" },
    { href: "/seller/reviews", label: "Reviews", icon: "sparkles", mobile: "more", header: true, section: "Sales" },
    { href: "/seller/finance", label: "Finance", icon: "chart", mobile: "more", section: "Sales" },
    { href: "/seller/messages", label: "Messages", tabLabel: "Mes\u00ADsages", icon: "message-circle", mobile: "primary", header: true, section: "Customers" },
    { href: "/seller/support", label: "Help", icon: "chat", mobile: "more", section: "Customers" },
    { href: "/account/verification", label: "PWD verification", icon: "shield", mobile: "more", section: "Account" },
  ],
  admin: [
    { href: "/admin", label: "Overview", tabLabel: "Over\u00ADview", icon: "grid", mobile: "primary", header: true, section: "Overview", exact: true },
    { href: "/admin/users", label: "Users", icon: "users", mobile: "primary", header: true, section: "People" },
    { href: "/admin/verifications", label: "Verifications", icon: "shield", mobile: "more", header: true, section: "People" },
    { href: "/admin/products", label: "Products", tabLabel: "Prod\u00ADucts", icon: "box", mobile: "primary", header: true, section: "Catalog" },
    { href: "/admin/orders", label: "Orders", icon: "truck", mobile: "more", header: true, section: "Catalog" },
    { href: "/admin/categories", label: "Categories", icon: "grid", mobile: "more", section: "Catalog" },
    { href: "/admin/reviews", label: "Reviews", icon: "sparkles", mobile: "more", section: "Catalog" },
    { href: "/admin/banners", label: "Banners", icon: "edit", mobile: "more", section: "Catalog" },
    { href: "/admin/tickets", label: "Tickets", icon: "flag", mobile: "primary", header: true, section: "Support" },
    { href: "/admin/reports", label: "Reports", icon: "chart", mobile: "more", header: true, section: "Insight" },
    { href: "/admin/payouts", label: "Payouts", icon: "download", mobile: "more", header: true, section: "Insight" },
    { href: "/admin/compliance", label: "Compliance", icon: "shield", mobile: "more", header: true, section: "Insight" },
    { href: "/admin/newsletter", label: "Newsletter", icon: "message-circle", mobile: "more", section: "Insight" },
    { href: "/admin/discounts", label: "Discounts", icon: "sparkles", mobile: "more", header: true, section: "Settings" },
    { href: "/admin/payments", label: "Payments", icon: "download", mobile: "more", header: true, section: "Settings" },
    { href: "/admin/theme", label: "Theme", icon: "sparkles", mobile: "more", header: true, section: "Settings" },
    { href: "/admin/settings", label: "Settings", icon: "edit", mobile: "more", section: "Settings" },
  ],
};

/**
 * Tabs inside /account. Verification is for buyers (discount) and sellers
 * (listings go live); admins review it instead of taking it.
 */
export const ACCOUNT_TABS: { href: string; label: string; roles: Exclude<NavRole, "guest">[] }[] = [
  { href: "/account", label: "Overview", roles: ["buyer", "seller", "admin"] },
  { href: "/account/profile", label: "Profile", roles: ["buyer", "seller", "admin"] },
  { href: "/account/addresses", label: "Addresses", roles: ["buyer"] },
  { href: "/account/verification", label: "PWD verification", roles: ["buyer", "seller"] },
  { href: "/account/notifications", label: "Notifications", roles: ["buyer", "seller", "admin"] },
  { href: "/account/privacy", label: "Privacy", roles: ["buyer", "seller", "admin"] },
];

/** Where the brand mark takes each role. */
export const HOME_HREF: Record<NavRole, string> = {
  guest: "/home",
  buyer: "/home",
  seller: "/seller/dashboard",
  admin: "/admin",
};

/** Is this item the page being shown? Exact match, or a listed prefix. */
export function isCurrent(pathname: string, item: Pick<NavItem, "href" | "match" | "exact">): boolean {
  if (item.exact) return pathname === item.href;
  if (pathname === item.href || pathname.startsWith(item.href + "/")) return true;
  return (item.match ?? []).some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/") || pathname.startsWith(prefix + "?"));
}

/** Sidebar groups in first-seen order. */
export function navSections(role: NavRole): { section: string; items: NavItem[] }[] {
  const out: { section: string; items: NavItem[] }[] = [];
  for (const item of NAV[role]) {
    const name = item.section ?? "";
    let group = out.find((g) => g.section === name);
    if (!group) {
      group = { section: name, items: [] };
      out.push(group);
    }
    group.items.push(item);
  }
  return out;
}

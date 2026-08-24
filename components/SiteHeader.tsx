import Link from "next/link";
import type { Role, SessionUser } from "@/lib/types";
import { maskEmail } from "@/lib/format";
import { getCartCount } from "@/lib/actions/cart";
import { getMyNotifications, getMyUnreadCount } from "@/lib/actions/notifications";
import { getMyUnreadMessageCount } from "@/lib/actions/messages";
import { CartBadge } from "./CartBadge";
import { SearchBox } from "./SearchBox";
import { NotificationBell } from "./NotificationBell";
import { ContrastToggle, LogoutButton } from "./HeaderActions";

type NavItem = { href: string; label: string; key: string };

const NAV: Record<Role, NavItem[]> = {
  buyer: [
    { href: "/home", label: "Shop", key: "home" },
    { href: "/buyer/wishlist", label: "Wishlist", key: "wishlist" },
    { href: "/buyer/orders", label: "My Orders", key: "orders" },
    { href: "/buyer/messages", label: "Messages", key: "messages" },
    { href: "/buyer/support", label: "Support", key: "support" },
  ],
  seller: [
    { href: "/seller/dashboard", label: "Dashboard", key: "dashboard" },
    { href: "/seller/products", label: "Products", key: "products" },
    { href: "/seller/orders", label: "Orders", key: "orders" },
    { href: "/seller/messages", label: "Messages", key: "messages" },
    { href: "/seller/reviews", label: "Reviews", key: "reviews" },
  ],
  admin: [
    { href: "/admin/users", label: "Users", key: "users" },
    { href: "/admin/products", label: "Products", key: "products" },
    { href: "/admin/tickets", label: "Tickets", key: "tickets" },
    { href: "/admin/compliance", label: "Compliance", key: "compliance" },
    { href: "/admin/reports", label: "Reports", key: "reports" },
    { href: "/admin/payments", label: "Payments", key: "payments" },
    { href: "/admin/theme", label: "Theme", key: "theme" },
  ],
};

const BRAND_HREF: Record<Role, string> = {
  buyer: "/home",
  seller: "/seller/dashboard",
  admin: "/admin/users",
};

export async function SiteHeader({
  variant,
  active,
  session,
}: {
  variant: Role;
  active: string;
  session: SessionUser | null;
}) {
  if (!session) {
    return (
      <header className="site-header site-header--buyer" role="banner">
        <div className="container header-row">
          <Link className="brand" href="/home" aria-label="IncluMarket home">
            <span className="brand-mark" aria-hidden="true">
              IM
            </span>
            <span className="brand-word">IncluMarket</span>
          </Link>

          <SearchBox />

          <nav className="header-nav" aria-label="Primary">
            <ContrastToggle />
            <Link className="btn btn--primary btn--sm" href="/login">
              Sign in
            </Link>
          </nav>
        </div>
      </header>
    );
  }

  const cartCount = variant === "buyer" ? await getCartCount() : 0;
  const [unread, notifications, unreadMessages] = await Promise.all([
    getMyUnreadCount(),
    getMyNotifications(),
    variant === "buyer" || variant === "seller" ? getMyUnreadMessageCount() : Promise.resolve(0),
  ]);

  return (
    <header
      className={`site-header site-header--${variant}`}
      role="banner"
    >
      <div className="container header-row">
        <Link className="brand" href={BRAND_HREF[variant]} aria-label="IncluMarket home">
          <span className="brand-mark" aria-hidden="true">
            IM
          </span>
          <span className="brand-word">
            IncluMarket{variant !== "buyer" ? <small>{variant === "admin" ? "Admin" : "Seller"}</small> : null}
          </span>
        </Link>

        {variant === "buyer" ? <SearchBox /> : null}

        <nav className="header-nav" aria-label="Primary">
          {NAV[variant].map((item) => (
            <Link
              key={item.key}
              className={`nav-link${active === item.key ? " nav-link--active" : ""}`}
              href={item.href}
            >
              {item.label}
              {item.key === "messages" && unreadMessages > 0 ? (
                <CartBadge count={unreadMessages} />
              ) : null}
            </Link>
          ))}
          {variant === "buyer" ? (
            <Link className="nav-link nav-link--cart" href="/buyer/cart" aria-label="Cart">
              Cart <CartBadge count={cartCount} />
            </Link>
          ) : null}
          <NotificationBell initialUnread={unread} initialNotifications={notifications} />
          <ContrastToggle />
          <LogoutButton />
        </nav>
      </div>

      <div className="user-strip" id="user-strip" aria-live="polite">
        <div className="container">
          <span>
            Signed in as <strong>{session.name}</strong> &middot;{" "}
            <span className="role-tag">{session.role}</span> &middot;{" "}
            <span title="Email masked in shared views">{maskEmail(session.email)}</span>
          </span>
        </div>
      </div>
    </header>
  );
}

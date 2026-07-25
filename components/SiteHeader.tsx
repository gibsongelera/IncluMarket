import Link from "next/link";
import type { Role, SessionUser } from "@/lib/types";
import { maskEmail } from "@/lib/format";
import { Icon } from "./Icon";
import { CartBadge } from "./CartBadge";
import { ContrastToggle, LogoutButton } from "./HeaderActions";

type NavItem = { href: string; label: string; key: string };

const NAV: Record<Role, NavItem[]> = {
  buyer: [
    { href: "/buyer/home", label: "Shop", key: "home" },
    { href: "/buyer/orders", label: "My Orders", key: "orders" },
    { href: "/buyer/support", label: "Support", key: "support" },
  ],
  seller: [
    { href: "/seller/dashboard", label: "Dashboard", key: "dashboard" },
    { href: "/seller/products", label: "Products", key: "products" },
    { href: "/seller/orders", label: "Orders", key: "orders" },
    { href: "/seller/reviews", label: "Reviews", key: "reviews" },
  ],
  admin: [
    { href: "/admin/users", label: "Users", key: "users" },
    { href: "/admin/products", label: "Products", key: "products" },
    { href: "/admin/tickets", label: "Tickets", key: "tickets" },
    { href: "/admin/compliance", label: "Compliance", key: "compliance" },
    { href: "/admin/theme", label: "Theme", key: "theme" },
  ],
};

const BRAND_HREF: Record<Role, string> = {
  buyer: "/buyer/home",
  seller: "/seller/dashboard",
  admin: "/admin/users",
};

export function SiteHeader({
  variant,
  active,
  session,
}: {
  variant: Role;
  active: string;
  session: SessionUser;
}) {
  return (
    <header
      className={`site-header site-header--${variant}`}
      role="banner"
    >
      <div className="container header-row">
        <Link className="brand" href={BRAND_HREF[variant]} aria-label="InkluMarket home">
          <span className="brand-mark" aria-hidden="true">
            IM
          </span>
          <span className="brand-word">
            InkluMarket{variant !== "buyer" ? <small>{variant === "admin" ? "Admin" : "Seller"}</small> : null}
          </span>
        </Link>

        {variant === "buyer" ? (
          <form className="search" role="search" action="/buyer/home">
            <label htmlFor="search-input" className="sr-only">
              Search products
            </label>
            <input
              id="search-input"
              name="q"
              type="search"
              placeholder="Search PWD-made products…"
              autoComplete="off"
            />
            <button type="submit" className="btn btn--primary" aria-label="Search">
              <Icon name="search" size={18} />
              <span>Search</span>
            </button>
          </form>
        ) : null}

        <nav className="header-nav" aria-label="Primary">
          {NAV[variant].map((item) => (
            <Link
              key={item.key}
              className={`nav-link${active === item.key ? " nav-link--active" : ""}`}
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
          {variant === "buyer" ? (
            <Link className="nav-link nav-link--cart" href="/buyer/cart" aria-label="Cart">
              Cart <CartBadge userId={session.user_id} />
            </Link>
          ) : null}
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

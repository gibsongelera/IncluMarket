"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CountBadge } from "./CountBadge";
import { isCurrent, NAV, type NavItem, type NavRole } from "@/lib/nav";

/**
 * The header's role links (md and up). The current page is derived from the
 * URL and announced with aria-current, so pages no longer pass an `active`
 * key (layouts, which render the header for Seller Centre and Admin, cannot
 * know it).
 *
 * A buyer's Cart comes last, after Help, as before; it is rendered here (not
 * in SiteHeader, a Server Component) so it is marked current like the rest.
 */
export function HeaderNavLinks({
  variant,
  unreadMessages = 0,
  wishlistCount = 0,
  cartCount = 0,
}: {
  variant: Exclude<NavRole, "guest">;
  unreadMessages?: number;
  wishlistCount?: number;
  cartCount?: number;
}) {
  const pathname = usePathname() || "";
  const cart = variant === "buyer" ? NAV.buyer.find((item) => item.href === "/buyer/cart") : undefined;
  return (
    <>
      {NAV[variant]
        .filter((item) => item.header)
        .map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname}>
            {item.href.endsWith("/messages") && unreadMessages > 0 ? (
              <CountBadge count={unreadMessages} label="unread" />
            ) : null}
            {item.href === "/buyer/wishlist" && wishlistCount > 0 ? (
              <CountBadge count={wishlistCount} label="saved" />
            ) : null}
          </NavLink>
        ))}
      {cart ? (
        <NavLink item={cart} pathname={pathname}>
          {cartCount > 0 ? <CountBadge count={cartCount} label="in cart" /> : null}
        </NavLink>
      ) : null}
    </>
  );
}

function NavLink({ item, pathname, children }: { item: NavItem; pathname: string; children?: React.ReactNode }) {
  const current = isCurrent(pathname, item);
  return (
    <Link
      className={`nav-link${current ? " nav-link--active" : ""}`}
      href={item.href}
      aria-current={current ? "page" : undefined}
    >
      {item.label}
      {children}
    </Link>
  );
}

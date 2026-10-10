"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CartBadge } from "./CartBadge";
import { isCurrent, NAV, type NavRole } from "@/lib/nav";

/**
 * The header's role links (md and up). The current page is derived from the
 * URL and announced with aria-current, so pages no longer pass an `active`
 * key (layouts, which render the header for Seller Centre and Admin, cannot
 * know it).
 */
export function HeaderNavLinks({
  variant,
  unreadMessages = 0,
}: {
  variant: Exclude<NavRole, "guest">;
  unreadMessages?: number;
}) {
  const pathname = usePathname() || "";
  return (
    <>
      {NAV[variant]
        .filter((item) => item.header)
        .map((item) => {
          const current = isCurrent(pathname, item);
          return (
            <Link
              key={item.href}
              className={`nav-link${current ? " nav-link--active" : ""}`}
              href={item.href}
              aria-current={current ? "page" : undefined}
            >
              {item.label}
              {item.href.endsWith("/messages") && unreadMessages > 0 ? <CartBadge count={unreadMessages} /> : null}
            </Link>
          );
        })}
    </>
  );
}

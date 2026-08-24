"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { logoutAction } from "@/lib/actions/auth";
import type { Role } from "@/lib/types";

/**
 * Bottom tab bar for phones, plus a "More" sheet for the overflow.
 *
 * SiteHeader had no mobile variant at all: below 768px its nav links, the
 * notification bell, the contrast toggle and the logout button all flex-wrapped
 * into a multi-line sticky block — seven links for an admin — with the user
 * strip underneath, eating a large part of a 375px viewport before any content.
 *
 * A bottom bar rather than a hamburger drawer, for this audience specifically:
 *   - targets sit in the natural thumb arc, which matters for users with
 *     limited reach, tremor, or one-handed use;
 *   - every destination is a full 56px target with no hidden state and no
 *     second tap;
 *   - labels stay visible. Icon-only navigation is a known barrier for
 *     cognitive disabilities, so the icons are decorative and the text is the
 *     accessible name.
 *
 * Rendered by SiteHeader so all 20 authenticated pages get it without edits.
 */

type Item = {
  href: string;
  label: string;
  icon: string;
  /** Also treat these path prefixes as "this tab is current". */
  match?: string[];
};

const PRIMARY: Record<Role, Item[]> = {
  buyer: [
    { href: "/home", label: "Shop", icon: "grid", match: ["/buyer/product"] },
    { href: "/buyer/wishlist", label: "Wishlist", icon: "heart" },
    { href: "/buyer/cart", label: "Cart", icon: "cart", match: ["/buyer/checkout"] },
    { href: "/buyer/orders", label: "Orders", icon: "box" },
  ],
  seller: [
    { href: "/seller/dashboard", label: "Home", icon: "chart" },
    { href: "/seller/products", label: "Products", icon: "box" },
    { href: "/seller/orders", label: "Orders", icon: "truck" },
    { href: "/seller/messages", label: "Chats", icon: "message-circle" },
  ],
  admin: [
    { href: "/admin/users", label: "Users", icon: "users" },
    { href: "/admin/products", label: "Products", icon: "box" },
    { href: "/admin/tickets", label: "Tickets", icon: "flag" },
    { href: "/admin/reports", label: "Reports", icon: "chart" },
  ],
};

const OVERFLOW: Record<Role, Item[]> = {
  buyer: [
    { href: "/buyer/messages", label: "Messages", icon: "message-circle" },
    { href: "/buyer/support", label: "Support", icon: "chat" },
  ],
  seller: [{ href: "/seller/reviews", label: "Reviews", icon: "sparkles" }],
  admin: [
    { href: "/admin/compliance", label: "Compliance", icon: "shield" },
    { href: "/admin/payments", label: "Payments", icon: "download" },
    { href: "/admin/theme", label: "Theme", icon: "sparkles" },
  ],
};

function isCurrent(pathname: string, item: Item): boolean {
  if (pathname === item.href) return true;
  return (item.match ?? []).some((prefix) => pathname.startsWith(prefix));
}

export function MobileNav({
  variant,
  cartCount = 0,
  unreadMessages = 0,
}: {
  variant: Role;
  cartCount?: number;
  unreadMessages?: number;
}) {
  const pathname = usePathname() || "";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const primary = PRIMARY[variant] ?? PRIMARY.buyer;
  const overflow = OVERFLOW[variant] ?? [];

  // Reserve exactly the bar's height at the bottom of the page, so the last row
  // of content is never hidden behind it and the floating buttons can offset
  // above it. Re-measured on resize and whenever the accessibility font size
  // changes, since the bar is sized in rem.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".mobile-nav");
    const root = document.documentElement;

    const measure = () => {
      const visible = el && getComputedStyle(el).display !== "none";
      root.style.setProperty("--bottom-inset", visible ? `${el.offsetHeight}px` : "0px");
    };

    measure();
    window.addEventListener("resize", measure);
    const observer = new MutationObserver(measure);
    observer.observe(root, { attributes: true, attributeFilter: ["data-font-px", "style"] });

    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
      root.style.setProperty("--bottom-inset", "0px");
    };
  }, []);

  function openMore() {
    dialogRef.current?.showModal();
  }

  function closeMore() {
    dialogRef.current?.close();
    // Return focus to the control that opened the sheet.
    moreButtonRef.current?.focus();
  }

  return (
    <>
      <nav className="mobile-nav" aria-label="Primary">
        {primary.map((item) => {
          const current = isCurrent(pathname, item);
          const badge =
            item.href === "/buyer/cart"
              ? cartCount
              : item.label === "Chats" || item.label === "Messages"
                ? unreadMessages
                : 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="mobile-nav__item"
              aria-current={current ? "page" : undefined}
            >
              <span className="mobile-nav__icon">
                <Icon name={item.icon} size={22} />
                {badge > 0 ? (
                  <span className="mobile-nav__badge" aria-hidden="true">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
              <span>{item.label}</span>
              {badge > 0 ? <span className="sr-only">, {badge} unread</span> : null}
            </Link>
          );
        })}

        <button
          type="button"
          className="mobile-nav__item"
          onClick={openMore}
          ref={moreButtonRef}
          aria-haspopup="dialog"
        >
          <span className="mobile-nav__icon">
            <Icon name="grid" size={22} />
          </span>
          <span>More</span>
        </button>
      </nav>

      {/* Native <dialog> gives the focus trap, Esc handling and inert backdrop
          for free — the same convention the rest of the app uses for modals. */}
      <dialog className="mobile-more" ref={dialogRef} aria-labelledby="more-title">
        <h2 id="more-title">More</h2>
        <ul className="mobile-more__list">
          {overflow.map((item) => (
            <li key={item.href}>
              <Link href={item.href} onClick={closeMore}>
                <Icon name={item.icon} size={20} />
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => void logoutAction()}>
              <Icon name="logout" size={20} />
              Sign out
            </button>
          </li>
          <li>
            <button type="button" onClick={closeMore}>
              <Icon name="x" size={20} />
              Close
            </button>
          </li>
        </ul>
      </dialog>
    </>
  );
}

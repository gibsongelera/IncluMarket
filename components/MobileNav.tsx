"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { NotificationBell } from "./NotificationBell";
import { logoutAction } from "@/lib/actions/auth";
import { isCurrent, NAV, type NavItem, type NavRole } from "@/lib/nav";
import type { Notification } from "@/lib/types";

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
 * Rendered by SiteHeader so every page gets it without edits — guests too:
 * they used to get no phone navigation at all (N-31). Items come from
 * lib/nav.ts, shared with the header links and the console sidebar.
 *
 * Signed in, the notification bell is a tab here, between the last tab and
 * More, and the phone header keeps only the brand and the search; Sign out
 * is in More. Six tabs do not always fit a label each (24px text, a 320px
 * phone, "Dashboard"), so when any label would be cut the bar becomes two
 * rows of three (data-rows, measured below) rather than ellipsize a word.
 */

function isCurrentItem(pathname: string, item: NavItem): boolean {
  return isCurrent(pathname, item);
}

export function MobileNav({
  variant,
  cartCount = 0,
  unreadMessages = 0,
  wishlistCount = 0,
  notifications,
}: {
  variant: NavRole;
  cartCount?: number;
  unreadMessages?: number;
  wishlistCount?: number;
  /** Signed in only: the bell's first state, as SiteHeader read it. */
  notifications?: { unread: number; items: Notification[] };
}) {
  const pathname = usePathname() || "";
  const navRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const measureRef = useRef<() => void>(() => {});

  const items = NAV[variant] ?? NAV.guest;
  const primary = items.filter((i) => i.mobile === "primary").slice(0, 4);
  const overflow = items.filter((i) => i.mobile === "more");

  // Lay the bar out, then reserve exactly its height at the bottom of the
  // page, so the last row of content is never hidden behind it and the
  // floating buttons can offset above it. Re-measured on resize and whenever
  // the accessibility font size changes, since the bar is sized in rem.
  useEffect(() => {
    const el = navRef.current;
    const root = document.documentElement;

    const measure = () => {
      const visible = el && getComputedStyle(el).display !== "none";
      let fixed = false;
      if (el && visible) {
        // One row first; two rows of three if any label is cut there. The
        // attributes change layout synchronously, so nothing paints between.
        el.removeAttribute("data-rows");
        el.removeAttribute("data-static");
        const cut = Array.from(el.querySelectorAll<HTMLElement>(".mobile-nav__label")).some(
          (label) => label.scrollWidth > label.clientWidth + 1,
        );
        if (cut) el.setAttribute("data-rows", "2");
        // A bar over a third of the window (two rows in a 320x256 window,
        // 400% zoom) would leave too little page for focus to land in
        // (WCAG 2.4.11): it sits in the page under the header instead and
        // scrolls away with it. <html>'s clientHeight, as HeaderMetrics.
        fixed = el.offsetHeight <= root.clientHeight / 3;
        if (!fixed) el.setAttribute("data-static", "");
      }
      root.style.setProperty("--bottom-inset", fixed && el ? `${el.offsetHeight}px` : "0px");
    };
    measureRef.current = measure;

    measure();
    window.addEventListener("resize", measure);
    const observer = new MutationObserver(measure);
    observer.observe(root, { attributes: true, attributeFilter: ["data-font-px", "style"] });

    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
      measureRef.current = () => {};
      root.style.setProperty("--bottom-inset", "0px");
    };
  }, []);

  // The current tab's label is bolder, so it is wider: check again after
  // every navigation.
  useEffect(() => {
    measureRef.current();
  }, [pathname]);

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
      <nav className="mobile-nav" aria-label="Primary" ref={navRef}>
        {primary.map((item) => {
          const current = isCurrentItem(pathname, item);
          const badge =
            item.href === "/buyer/cart"
              ? cartCount
              : item.href === "/buyer/wishlist"
                ? wishlistCount
                : item.href.endsWith("/messages")
                  ? unreadMessages
                  : 0;
          const badgeWords =
            item.href === "/buyer/cart" ? "in cart" : item.href === "/buyer/wishlist" ? "saved" : "unread";

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
              <span className="mobile-nav__label">{item.label}</span>
              {badge > 0 ? <span className="sr-only">, {badge} {badgeWords}</span> : null}
            </Link>
          );
        })}

        {notifications ? (
          <NotificationBell
            variant="tab"
            initialUnread={notifications.unread}
            initialNotifications={notifications.items}
          />
        ) : null}

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
          <span className="mobile-nav__label">More</span>
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
          {variant === "guest" ? null : (
            <li>
              <button type="button" onClick={() => void logoutAction()}>
                <Icon name="logout" size={20} />
                Sign out
              </button>
            </li>
          )}
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

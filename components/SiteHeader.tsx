import Link from "next/link";
import type { Role, SessionUser } from "@/lib/types";
import { maskEmail } from "@/lib/format";
import { getCartCount } from "@/lib/actions/cart";
import { getMyNotifications, getMyUnreadCount } from "@/lib/actions/notifications";
import { getMyUnreadMessageCount } from "@/lib/actions/messages";
import { CartBadge } from "./CartBadge";
import { SearchBox } from "./SearchBox";
import { ScopedSearchBox } from "./ScopedSearchBox";
import { NotificationBell } from "./NotificationBell";
import { LogoutButton } from "./HeaderActions";
import { MobileNav } from "./MobileNav";
import { HeaderNavLinks } from "./HeaderNavLinks";
import { HOME_HREF } from "@/lib/nav";

export async function SiteHeader({
  variant,
  active,
  session,
}: {
  variant: Role;
  /** @deprecated The current page is read from the URL; kept so callers compile. */
  active?: string;
  session: SessionUser | null;
}) {
  if (!session) {
    return (
      <>
      <header className="site-header site-header--buyer" role="banner">
        <div className="container header-row">
          <Link className="brand" href="/home" aria-label="InclusiveMarket home">
            <span className="brand-mark" aria-hidden="true">
              IM
            </span>
            <span className="brand-word">InclusiveMarket</span>
          </Link>

          <SearchBox />

          <nav className="header-nav" aria-label="Primary">
            <Link className="btn btn--primary btn--sm" href="/login">
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <MobileNav variant="guest" />
      </>
    );
  }

  const cartCount = variant === "buyer" ? await getCartCount() : 0;
  const [unread, notifications, unreadMessages] = await Promise.all([
    getMyUnreadCount(),
    getMyNotifications(),
    variant === "buyer" || variant === "seller" ? getMyUnreadMessageCount() : Promise.resolve(0),
  ]);

  return (
    <>
      <header className={`site-header site-header--${variant}`} role="banner">
        <div className="container header-row">
          <Link className="brand" href={HOME_HREF[variant]} aria-label="InclusiveMarket home">
            <span className="brand-mark" aria-hidden="true">
              IM
            </span>
            <span className="brand-word">
              InclusiveMarket{variant !== "buyer" ? <small>{variant === "admin" ? "Admin" : "Seller"}</small> : null}
            </span>
          </Link>

          {/* Buyers search the catalog; sellers and admins search their own
              dashboard data. Scope is decided server-side from the session,
              never from a prop. */}
          {variant === "buyer" ? <SearchBox /> : <ScopedSearchBox variant={variant} />}

          <nav className="header-nav" aria-label="Primary">
            <HeaderNavLinks variant={variant} unreadMessages={unreadMessages} />
            {variant === "buyer" ? (
              <Link className="nav-link nav-link--cart" href="/buyer/cart" aria-label="Cart">
                Cart <CartBadge count={cartCount} />
              </Link>
            ) : null}
            <NotificationBell initialUnread={unread} initialNotifications={notifications} />
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

      {/* Phone navigation. Rendered here so every page that shows a header gets
          it without editing all 20 of them — but deliberately OUTSIDE <header>.
          .site-header is position:sticky with a z-index, which makes it a
          stacking context; a fixed child of it cannot paint above anything
          outside that context no matter how high its own z-index is. Nested
          inside, the tab bar sat underneath the floating accessibility and chat
          buttons. */}
      <MobileNav
        variant={variant}
        cartCount={cartCount}
        unreadMessages={unreadMessages}
      />
    </>
  );
}

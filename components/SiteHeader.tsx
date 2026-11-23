import Link from "next/link";
import type { Role, SessionUser } from "@/lib/types";
import { maskEmail } from "@/lib/format";
import { getHeaderData } from "@/lib/header-data";
import { SearchBox } from "./SearchBox";
import { ScopedSearchBox } from "./ScopedSearchBox";
import { NotificationBell } from "./NotificationBell";
import { LogoutButton } from "./HeaderActions";
import { MobileNav } from "./MobileNav";
import { HeaderNavLinks } from "./HeaderNavLinks";
import { HOME_HREF } from "@/lib/nav";
import { BrandMark } from "./BrandMark";

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
        {/* --tabbed: on a phone this row is the brand and the search only,
            as when signed in. Sign in is a tab in the bar (MobileNav), and
            Create account is in its More sheet. */}
        <div className="container header-row header-row--tabbed">
          <Link className="brand" href="/home" aria-label="InclusiveMarket home">
            <BrandMark />
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

  // One batch, with the session the page already resolved (memoised per
  // request): the public actions would each resolve it again (finding 71).
  const { cartCount, wishlistCount, unread, notifications, unreadMessages } = await getHeaderData(variant);
  const roleLabel = variant === "admin" ? "Admin" : variant === "seller" ? "Seller" : null;

  return (
    <>
      <header className={`site-header site-header--${variant}`} role="banner">
        {/* --tabbed: on a phone this row is the brand and the search only.
            Its nav (links, Cart, the bell, Sign out) is hidden there: the tab
            bar has the links and the bell, its More sheet has Sign out. */}
        <div className="container header-row header-row--tabbed">
          {/* The name carries the visible "Seller"/"Admin" too (label in name,
              WCAG 2.5.3); it is an aria-label because on a phone only the
              mark shows. The space before <small> keeps the words apart. */}
          <Link
            className="brand"
            href={HOME_HREF[variant]}
            aria-label={`InclusiveMarket${roleLabel ? ` ${roleLabel}` : ""} home`}
          >
            <BrandMark />
            <span className="brand-word">
              InclusiveMarket
              {roleLabel ? (
                <>
                  {" "}
                  <small>{roleLabel}</small>
                </>
              ) : null}
            </span>
          </Link>

          {/* Buyers search the catalog; sellers and admins search their own
              dashboard data. Scope is decided server-side from the session,
              never from a prop. */}
          {variant === "buyer" ? <SearchBox /> : <ScopedSearchBox variant={variant} />}

          <nav className="header-nav" aria-label="Primary">
            {/* Cart is among these links (last, for a buyer). Its count reads
                "2 in cart" and, like the others, shows only above zero. */}
            <HeaderNavLinks
              variant={variant}
              unreadMessages={unreadMessages}
              wishlistCount={wishlistCount}
              cartCount={cartCount}
            />
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
            <Link className="user-strip__link" href="/account">
              Your account
            </Link>
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
        wishlistCount={wishlistCount}
        notifications={{ unread, items: notifications }}
      />
    </>
  );
}

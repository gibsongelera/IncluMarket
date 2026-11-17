import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getMyVerification } from "@/lib/pwd/data";
import { VerificationStatus } from "@/components/VerificationStatus";
import { getBuyerDashboard, type BuyerDashboard } from "@/lib/buyer-dashboard";
import { KpiCard, type KpiIconTone } from "@/components/KpiCard";
import { Icon } from "@/components/Icon";
import { Pill } from "@/components/Pill";
import { StorefrontCard } from "@/components/StorefrontGrid";
import { RecommendationRail } from "@/components/RecommendationRail";
import { ACCOUNT_TABS, NAV } from "@/lib/nav";
import { BUYER_TABS, type PurchaseTab } from "@/lib/orders/state";
import { formatDate, money } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your account" };

const ROLE_LABEL = { buyer: "Buyer", seller: "Seller", admin: "Administrator" } as const;

export default async function AccountPage() {
  const session = await requireRole([]);
  // Buyers get the purchases dashboard (05 §3), read for their own id only.
  if (session.role === "buyer") {
    const dash = await getBuyerDashboard(session.user_id);
    return <BuyerOverview firstName={session.name.trim().split(/\s+/)[0] || "there"} dash={dash} />;
  }
  const my = session.role === "admin" ? null : await getMyVerification(session.user_id);

  return (
    <>
      <h1>Your account</h1>
      <div className="account-grid">
        <section className="card" aria-labelledby="acct-details">
          <h2 id="acct-details">Account details</h2>
          <dl className="details-list">
            <dt>Name</dt>
            <dd>{session.name}</dd>
            <dt>Email</dt>
            <dd>{session.email}</dd> {/* props-ok: the signed-in user reading their own address */}
            <dt>Account type</dt>
            <dd>{ROLE_LABEL[session.role]}</dd>
          </dl>
        </section>

        {my && session.role !== "admin" ? (
          <VerificationStatus my={my} role={session.role} compact />
        ) : (
          <section className="card" aria-labelledby="acct-admin">
            <h2 id="acct-admin">PWD verification</h2>
            <p>You review PWD IDs rather than submit one.</p>
            <p>
              <Link href="/admin/users" className="btn btn--outline btn--sm">
                Go to the admin console
              </Link>
            </p>
          </section>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// The buyer dashboard (P4-06, 05 §3). A Server Component: nothing here is
// passed to a client component except the storefront cards, which take the
// public StorefrontItem DTO, and RecommendationRail's picks (the same).
// ---------------------------------------------------------------------------

/** The four "My purchases" tiles, in BUYER_TABS order. The icon is decorative; the label is the name. */
const TILES: { tab: PurchaseTab; icon: string; tone: KpiIconTone }[] = [
  { tab: "to_pay", icon: "wallet", tone: "warn" },
  { tab: "to_ship", icon: "box", tone: "blue" },
  { tab: "to_receive", icon: "truck", tone: "teal" },
  { tab: "returns", icon: "undo", tone: "brown" },
];

const SHORTCUT_ICON: Record<string, string> = {
  "/account/profile": "user",
  "/account/addresses": "map-pin",
  "/account/verification": "shield",
  "/account/notifications": "bell",
  "/account/privacy": "lock",
};

/** The buyer's account sections except Overview (this page), then Help: one nav source (lib/nav.ts). */
const SHORTCUTS: { href: string; label: string; icon: string }[] = [
  ...ACCOUNT_TABS.filter((t) => t.roles.includes("buyer") && t.href !== "/account").map((t) => ({
    href: t.href,
    label: t.label,
    icon: SHORTCUT_ICON[t.href] ?? "arrow-right",
  })),
  ...NAV.buyer.filter((i) => i.href === "/buyer/support").map((i) => ({ href: i.href, label: i.label, icon: i.icon })),
];

/** One widget's own error state: the rest of the page still renders (05 §3). */
function WidgetError({ what }: { what: string }) {
  return (
    <div className="empty">
      <p>
        <strong>We couldn&rsquo;t load {what}.</strong>
      </p>
      <p>
        Try again later, or <a href="/account">reload the page</a>.
      </p>
    </div>
  );
}

function BuyerOverview({ firstName, dash }: { firstName: string; dash: BuyerDashboard }) {
  const { counts, recent, verification, wishlist, rec } = dash;
  return (
    <>
      <div className="page-head buyer-dash__head">
        <div className="page-head__text">
          <h1>Hi, {firstName}</h1>
        </div>
        <Link className="btn btn--outline" href="/account/profile">
          Edit profile
        </Link>
      </div>

      <div className="buyer-dash">
        <section className="buyer-dash__wide buyer-dash__purchases" aria-labelledby="dash-purchases">
          <div className="section-head">
            <h2 id="dash-purchases">My purchases</h2>
            <Link className="section-head__link" href="/buyer/orders">
              View all orders <Icon name="arrow-right" />
            </Link>
          </div>
          {counts === null ? (
            <WidgetError what="your order counts" />
          ) : (
            <ul className="purchase-tiles" role="list">
              {TILES.map((t) => (
                <li key={t.tab}>
                  <KpiCard
                    label={BUYER_TABS.find((b) => b.value === t.tab)?.label ?? t.tab}
                    value={counts[t.tab]}
                    unit={counts[t.tab] === 1 ? "order" : "orders"}
                    href={`/buyer/orders?tab=${t.tab}`}
                    icon={t.icon}
                    tone={t.tone}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="dash-recent">
          <div className="section-head">
            <h2 id="dash-recent">Recent orders</h2>
          </div>
          {recent === null ? (
            <WidgetError what="your recent orders" />
          ) : recent.length === 0 ? (
            <div className="empty">
              <p>
                <strong>No orders yet</strong>
              </p>
              <p>What you buy shows here, with where it is on its way.</p>
              <Link href="/home" className="btn btn--primary">
                Start shopping
              </Link>
            </div>
          ) : (
            <ul className="card dash-orders" role="list">
              {recent.map((o) => (
                <li key={o.id} className="dash-order">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="dash-order__thumb" src={o.thumb} alt="" width={56} height={56} />
                  <div className="dash-order__body">
                    <h3 className="dash-order__title">{o.title}</h3>
                    <p className="dash-order__meta">
                      {o.shop ? <>{o.shop} &middot; </> : null}
                      {o.itemCount} item{o.itemCount === 1 ? "" : "s"}
                    </p>
                    <p className="dash-order__meta">
                      Order #{o.id} &middot; {formatDate(o.createdAt)}
                    </p>
                    <div className="dash-order__foot">
                      <Pill status={o.status} label={o.statusText} />
                      <strong className="dash-order__total">{money(o.total)}</strong>
                      <Link className="btn btn--outline btn--sm dash-order__track" href={`/buyer/orders/${o.id}`}>
                        Track<span className="sr-only">&nbsp;order #{o.id}</span>
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="dash-verification">
          <div className="section-head">
            <h2 id="dash-verification">PWD verification</h2>
          </div>
          {verification === null ? (
            <WidgetError what="your PWD verification" />
          ) : (
            <VerificationStatus my={verification} role="buyer" compact headingLevel={3} />
          )}
        </section>

        <section aria-labelledby="dash-wishlist">
          <div className="section-head">
            <h2 id="dash-wishlist">Wishlist{wishlist ? ` (${wishlist.total})` : ""}</h2>
            {wishlist && wishlist.total > 0 ? (
              <Link className="section-head__link" href="/buyer/wishlist">
                View all<span className="sr-only">&nbsp;saved items</span> <Icon name="arrow-right" />
              </Link>
            ) : null}
          </div>
          {wishlist === null ? (
            <WidgetError what="your wishlist" />
          ) : wishlist.items.length === 0 ? (
            <div className="empty">
              {wishlist.total > 0 ? (
                <>
                  <p>
                    <strong>Nothing you saved is for sale right now</strong>
                  </p>
                  <p>Your wishlist keeps them in case they come back.</p>
                </>
              ) : (
                <>
                  <p>
                    <strong>Nothing saved yet</strong>
                  </p>
                  <p>Tap the heart on any product to keep it here.</p>
                  <Link href="/home" className="btn btn--primary">
                    Browse products
                  </Link>
                </>
              )}
            </div>
          ) : (
            <ul className="dash-cards" role="list">
              {wishlist.items.map((i) => (
                <li key={i.id}>
                  <StorefrontCard item={i} wishlisted showWishlist />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="dash-shortcuts">
          <div className="section-head">
            <h2 id="dash-shortcuts">Shortcuts</h2>
          </div>
          <ul className="card dash-shortcuts" role="list">
            {SHORTCUTS.map((s) => (
              <li key={s.href}>
                <Link className="dash-shortcut" href={s.href}>
                  <Icon name={s.icon} />
                  <span>{s.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {rec === null ? (
          <section className="buyer-dash__wide" aria-labelledby="dash-picks">
            <div className="section-head">
              <h2 id="dash-picks">Picked for you</h2>
            </div>
            <WidgetError what="your picks" />
          </section>
        ) : rec.items.length ? (
          <div className="buyer-dash__wide">
            {/* The hearts show what is saved only when the wishlist could be read. */}
            <RecommendationRail rec={rec} wishlistIds={wishlist?.savedIds ?? []} showWishlist={wishlist !== null} />
          </div>
        ) : null}
      </div>
    </>
  );
}

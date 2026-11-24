import Link from "next/link";
import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AccountTabs } from "@/components/AccountTabs";

export const dynamic = "force-dynamic";

/**
 * Account area for every signed-in role. Pages render their own heading and
 * content; the header, section links and footer stay put between them.
 *
 * While an admin assists a seller (lib/assist) the whole area is closed: the
 * seller's name and phone, password, privacy requests, notification settings,
 * addresses and PWD ID are theirs. The actions refuse too (ASSIST_CLOSED);
 * this says so before anyone fills in a form.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole([]);
  return (
    <>
      <SiteHeader variant={session.role} session={session} />
      <main id="main" tabIndex={-1} className="container main--account">
        {session.assistedBy ? (
          <section className="card assist-closed" aria-labelledby="assist-closed-title">
            <h1 id="assist-closed-title">{session.name}&rsquo;s account settings stay theirs</h1>
            <p>
              While you assist them, their name and phone, password, privacy requests, notification settings,
              addresses and PWD ID are closed to you. Choose Stop assisting at the top of the page to go back to
              your own account.
            </p>
            <p>
              <Link className="btn btn--primary" href="/seller/dashboard">
                Back to their Seller Centre
              </Link>
            </p>
          </section>
        ) : (
          <>
            <AccountTabs role={session.role} />
            {children}
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

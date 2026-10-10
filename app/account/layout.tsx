import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AccountTabs } from "@/components/AccountTabs";

export const dynamic = "force-dynamic";

/**
 * Account area for every signed-in role. Pages render their own heading and
 * content; the header, section links and footer stay put between them.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole([]);
  return (
    <>
      <SiteHeader variant={session.role} session={session} />
      <main id="main" tabIndex={-1} className="container main--account">
        <AccountTabs role={session.role} />
        {children}
      </main>
      <SiteFooter />
    </>
  );
}

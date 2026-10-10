import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { getRenderSession } from "@/lib/session";

/**
 * Shell for the content pages (About, Contact, FAQ, Privacy, Terms,
 * Accessibility, account notices). It used to render a logo-only header —
 * no search, no navigation, no way to sign in — so these pages were a dead
 * end, worst of all on a phone (N-31). They now get the same header and
 * phone navigation as the rest of the site, for guests and signed-in users.
 */
export async function StaticPageLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const session = await getRenderSession().catch(() => null);
  return (
    <>
      <SiteHeader variant={session?.role ?? "buyer"} session={session} />
      <main id="main" tabIndex={-1} className="container static-page">
        <article className="prose">
          <h1>{title}</h1>
          {children}
        </article>
      </main>
      <SiteFooter />
    </>
  );
}

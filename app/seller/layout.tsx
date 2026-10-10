import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ConsoleNav } from "@/components/ConsoleNav";

export const dynamic = "force-dynamic";

/**
 * Seller Centre shell: header, a left sidebar from 1024px up (the phone tab
 * bar and header links cover smaller screens), and the footer. Each page
 * renders only its own <main>. The role check here is repeated by every page,
 * which needs the session anyway; getRenderSession() makes that one lookup.
 */
export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["seller"]);
  return (
    <>
      <SiteHeader variant="seller" session={session} />
      <div className="container console">
        <ConsoleNav variant="seller" />
        <div className="console__content">{children}</div>
      </div>
      <SiteFooter />
    </>
  );
}

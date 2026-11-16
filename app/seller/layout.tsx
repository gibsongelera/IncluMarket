import { Suspense } from "react";
import { requireRole } from "@/lib/session";
import { getSellerBadges } from "@/lib/seller-analytics";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ConsoleNav } from "@/components/ConsoleNav";

export const dynamic = "force-dynamic";

/**
 * Seller Centre shell: header, a left sidebar from 1024px up (the phone tab
 * bar and header links cover smaller screens), and the footer. Each page
 * renders only its own <main>. The role check here is repeated by every page,
 * which needs the session anyway; getRenderSession() makes that one lookup.
 *
 * The sidebar's badges (P3-04, 04 §2) are the dashboard's to-do counts:
 * Orders (new + to ship), Reviews (no reply yet) and Messages (unread), read
 * once per request through getSellerTodo()'s React cache, so on the
 * dashboard the badges and the tiles share one set of counts. As in the
 * admin console they stream in their own Suspense boundary, with the plain
 * sidebar as the fallback, so the page never waits for them. They refresh
 * on a full load and after an action that calls router.refresh(), not on a
 * plain soft navigation between seller pages.
 */
export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["seller"]);
  return (
    <>
      <SiteHeader variant="seller" session={session} />
      <div className="container console">
        <Suspense fallback={<ConsoleNav variant="seller" />}>
          <SellerNav />
        </Suspense>
        <div className="console__content">{children}</div>
      </div>
      <SiteFooter />
    </>
  );
}

/** The sidebar with its badges, once the counts are in. */
async function SellerNav() {
  const badges = await getSellerBadges();
  return <ConsoleNav variant="seller" badges={badges} />;
}

import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WishlistClient } from "@/components/WishlistClient";
import { getWishlistView } from "@/lib/storefront";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your wishlist" };

export default async function WishlistPage() {
  const session = await requireRole(["buyer"]);
  const view = await getWishlistView(session.user_id);

  return (
    <>
      <SiteHeader variant="buyer" active="wishlist" session={session} />
      <main id="main" tabIndex={-1} className="container main--wishlist">
        <h1>Your wishlist</h1>
        <WishlistClient items={view.items} unavailable={view.unavailable} variants={view.variants} />
      </main>
      <SiteFooter />
    </>
  );
}

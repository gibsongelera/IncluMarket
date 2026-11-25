import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CartClient } from "@/components/CartClient";
import { priceCartForBuyer } from "@/lib/pricing/engine";
import { getDisplayNames } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your cart" };

export default async function CartPage() {
  const session = await requireRole(["buyer"]);
  // Priced by the same engine placeOrder uses, so the totals shown here are
  // the totals charged. No catalogue-wide reads: only this cart's products.
  const cart = await priceCartForBuyer(session.user_id);
  const sellerNames = await getDisplayNames(cart.groups.map((g) => g.sellerId));

  return (
    <>
      <SiteHeader variant="buyer" active="home" session={session} />
      <main id="main" tabIndex={-1} className="container main--cart">
        <h1>Your cart</h1>
        <CartClient cart={cart} sellerNames={sellerNames} />
      </main>
      <SiteFooter />
    </>
  );
}

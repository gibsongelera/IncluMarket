import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CheckoutClient } from "@/components/CheckoutClient";
import { priceCartForBuyer } from "@/lib/pricing/engine";
import { getAddresses, getDisplayNames } from "@/lib/data";
import { isPayMongoConfigured } from "@/lib/payments/paymongo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout" };

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string; items?: string }>;
}) {
  const session = await requireRole(["buyer"]);
  const sp = await searchParams;
  // ?items= limits checkout to the lines chosen in the cart, or to the one
  // line "Buy now" put there (C-29). Without it, the whole cart.
  const items = (sp.items ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 100);
  const [cart, addresses] = await Promise.all([
    priceCartForBuyer(session.user_id, items.length ? items : undefined),
    getAddresses(session.user_id),
  ]);

  if (!cart.lines.length) redirect("/buyer/cart");
  const sellerNames = await getDisplayNames(cart.groups.map((g) => g.sellerId));
  const cancelled = Number(sp.cancelled);

  return (
    <>
      <SiteHeader variant="buyer" active="home" session={session} />
      <main id="main" tabIndex={-1} className="container main--checkout">
        <h1>Checkout</h1>
        <CheckoutClient
          userName={session.name}
          onlinePaymentEnabled={isPayMongoConfigured()}
          cart={cart}
          sellerNames={sellerNames}
          addresses={addresses}
          selection={items.length ? items : null}
          cancelledOrderId={Number.isInteger(cancelled) && cancelled > 0 ? cancelled : null}
        />
      </main>
      <SiteFooter />
    </>
  );
}

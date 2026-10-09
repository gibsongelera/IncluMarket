import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CheckoutClient } from "@/components/CheckoutClient";
import { priceCartForBuyer } from "@/lib/pricing/engine";
import { getDisplayNames } from "@/lib/data";
import { isPayMongoConfigured } from "@/lib/payments/paymongo";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const session = await requireRole(["buyer"]);
  const sp = await searchParams;
  const cart = await priceCartForBuyer(session.user_id);

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
          cancelledOrderId={Number.isInteger(cancelled) && cancelled > 0 ? cancelled : null}
        />
      </main>
      <SiteFooter />
    </>
  );
}

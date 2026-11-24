import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PayWorkshopView } from "@/components/PayWorkshopView";
import { getCounterAccounts, getCounterCheckout } from "@/lib/counter-payments";
import { expireStalePayments } from "@/lib/payments/stock";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay the Workshop" };

/**
 * Pay the Workshop (migration 0028): where a buyer who chose to pay over the
 * counter sends the checkout's total — the Workshop's GCash, Maribank or
 * LandBank accounts, set on Admin → Payments — and then sends the reference
 * number for an admin to check. Only the buyer who placed the checkout sees
 * it; anyone else gets a 404.
 */
export default async function PayWorkshopPage({ params }: { params: Promise<{ checkout: string }> }) {
  const session = await requireRole(["buyer"]);
  const { checkout: raw } = await params;
  await expireStalePayments();
  const checkout = await getCounterCheckout(Number(raw), session.user_id);
  if (!checkout) notFound();
  const accounts = (await getCounterAccounts({ activeOnly: true })) ?? [];

  return (
    <>
      <SiteHeader variant="buyer" active="orders" session={session} />
      <main id="main" tabIndex={-1} className="container main--orders">
        <PayWorkshopView checkout={checkout} accounts={accounts} />
      </main>
      <SiteFooter />
    </>
  );
}

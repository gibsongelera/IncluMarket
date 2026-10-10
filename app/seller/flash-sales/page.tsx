import { requireRole } from "@/lib/session";
import { getSellerFlashSales } from "@/lib/data";
import { SellerFlashSales } from "@/components/SellerFlashSales";

export const dynamic = "force-dynamic";
export const metadata = { title: "Flash sales" };

export default async function FlashSalesPage() {
  const session = await requireRole(["seller"]);
  const sales = await getSellerFlashSales(session.user_id);
  return (
    <main id="main" tabIndex={-1} className="main--seller">
      <h1>Flash sales</h1>
      <p className="lede">1 hour to 7 days, on live listings, one at a time per product. Buyers who saved the item are told.</p>
      <SellerFlashSales sales={sales} now={Date.now()} />
    </main>
  );
}

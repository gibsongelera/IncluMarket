import { requireRole } from "@/lib/session";
import { getSellerFinance } from "@/lib/finance";
import { SellerFinanceClient } from "@/components/SellerFinanceClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance" };

export default async function SellerFinancePage() {
  const session = await requireRole(["seller"]);
  const finance = await getSellerFinance(session.user_id);
  return (
    <main id="main" tabIndex={-1} className="main--seller">
      <h1>Finance</h1>
      {finance.available ? (
        <SellerFinanceClient finance={finance} closed={Boolean(session.assistedBy)} />
      ) : (
        <p className="notice notice--info">Earnings and payouts need database migration 0020.</p>
      )}
    </main>
  );
}

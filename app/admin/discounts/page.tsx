import { requireRole } from "@/lib/session";
import { getCategories, getDiscountRulesForAdmin } from "@/lib/data";
import { AdminDiscountsClient } from "@/components/AdminDiscountsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "PWD discounts" };

/**
 * Admin → Discounts (C-26). The legal landscape, in short, so the person
 * turning a rule on knows what each type means.
 */
export default async function AdminDiscountsPage() {
  await requireRole(["admin"]);
  const [rules, categories] = await Promise.all([getDiscountRulesForAdmin(), getCategories()]);

  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <h1>PWD discounts</h1>
      <div className="notice notice--warning">
        <p>
          <strong>Every rule is off until a lawyer confirms it applies.</strong> RA 10754 (20% plus VAT exemption) covers
          only listed goods and services such as medicines, medical services, restaurants and transport — most items
          here are not on that list. DTI-DA JMC 01-2022 gives 5% on basic necessities and prime commodities, on up to
          ₱1,300 of purchases a week. A voluntary promotion by a seller or by InclusiveMarket is always allowed.
        </p>
        <p>Only buyers with an approved, unexpired PWD verification get a discount.</p>
      </div>
      {rules === null ? (
        <p className="notice notice--info">Discount rules need database migration 0018.</p>
      ) : (
        <AdminDiscountsClient rules={rules} categories={categories} />
      )}
    </main>
  );
}

import { requireRole } from "@/lib/session";
import { getShopSettings } from "@/lib/data";
import { ShopSettingsForm } from "@/components/ShopSettingsForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop settings" };

export default async function ShopSettingsPage() {
  const session = await requireRole(["seller"]);
  const s = await getShopSettings(session.user_id);
  return (
    <main id="main" tabIndex={-1} className="main--seller">
      <h1>Shop settings</h1>
      <ShopSettingsForm sellerId={session.user_id} initial={{ shopName: s.shopName, story: s.story, city: s.city }} available={s.available} />
    </main>
  );
}

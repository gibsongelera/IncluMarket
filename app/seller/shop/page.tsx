import { requireRole } from "@/lib/session";
import { getShopSettings } from "@/lib/data";
import { ShopSettingsForm } from "@/components/ShopSettingsForm";
import { ShopImagePicker } from "@/components/ShopImagePicker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop settings" };

export default async function ShopSettingsPage() {
  const session = await requireRole(["seller"]);
  const s = await getShopSettings(session.user_id);
  return (
    <main id="main" tabIndex={-1} className="main--seller">
      <h1>Shop settings</h1>
      <div className="account-grid">
        <ShopSettingsForm sellerId={session.user_id} initial={{ shopName: s.shopName, story: s.story, city: s.city }} available={s.available} />
        <section className="card form" aria-label="Shop images">
          <ShopImagePicker kind="logo" label="Logo" hint="A square image works best." url={s.logo} disabled={!s.available} />
          <ShopImagePicker kind="banner" label="Banner" hint="A wide image across the top of your shop page." url={s.banner} disabled={!s.available} />
        </section>
      </div>
    </main>
  );
}

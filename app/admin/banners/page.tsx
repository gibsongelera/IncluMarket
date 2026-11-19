import { requireRole } from "@/lib/session";
import { getAdminBanners } from "@/lib/admin-content";
import { AdminBannersClient } from "@/components/AdminBannersClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Banners" };

/** Admin → Banners (C-40): the homepage's merchandising strip. */
export default async function AdminBannersPage() {
  await requireRole(["admin"]);
  const banners = await getAdminBanners();
  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <h1>Homepage banners</h1>
      <p className="muted">
        Banners show at the top of the shop between their start and end times, in this order. They can link only to
        pages inside the shop. Featured products and sellers are set on the Products and Users pages.
      </p>
      {banners === null ? (
        <p className="notice notice--info">Banners need database migration 0019.</p>
      ) : (
        <AdminBannersClient banners={banners} />
      )}
    </main>
  );
}

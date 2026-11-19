import { requireRole } from "@/lib/session";
import { getAdminCategories } from "@/lib/admin-content";
import { AdminCategoriesClient } from "@/components/AdminCategoriesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Categories" };

/** Admin → Categories (C-40): add, rename, reorder, retire and restore. */
export default async function AdminCategoriesPage() {
  await requireRole(["admin"]);
  const { categories, managed } = await getAdminCategories();
  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <h1>Categories</h1>
      <p className="muted">
        Retiring a category takes it out of the shop&rsquo;s filters and the list sellers choose from. Its products stay
        listed and keep their category, and you can restore it at any time.
      </p>
      {managed ? null : (
        <p className="notice notice--info">
          Ordering, icons, descriptions and retiring need database migration 0020. Until then you can add and rename
          categories.
        </p>
      )}
      <AdminCategoriesClient categories={categories} managed={managed} />
    </main>
  );
}

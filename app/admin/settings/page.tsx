import { requireRole } from "@/lib/session";
import { getAdminSettings } from "@/lib/admin-content";
import { AdminSettingsClient } from "@/components/AdminSettingsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

/**
 * Admin → Settings (C-40): the numbers the client had not confirmed —
 * return window, ID photo retention, fees — changeable without a deploy.
 */
export default async function AdminSettingsPage() {
  await requireRole(["admin"]);
  const settings = await getAdminSettings();
  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <h1>Settings</h1>
      <p className="muted">
        Changes apply at once and are recorded in the audit log. The Privacy Policy, FAQ and Terms read these numbers,
        so they stay in step.
      </p>
      {settings === null ? (
        <p className="notice notice--info">Settings need database migration 0014. The defaults apply until then.</p>
      ) : (
        <AdminSettingsClient settings={settings} />
      )}
    </main>
  );
}

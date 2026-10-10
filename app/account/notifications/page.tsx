import { requireRole } from "@/lib/session";
import { getNotificationPrefs } from "@/lib/data";
import { groupsFor } from "@/lib/notification-types";
import { NotificationSettings } from "@/components/NotificationSettings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage() {
  const session = await requireRole([]);
  const prefs = await getNotificationPrefs(session.user_id);
  const rows = groupsFor(session.role).map((g) => ({
    key: g.key,
    label: g.label,
    hint: g.hint,
    // A group is on unless every type in it was turned off.
    inApp: g.types.some((t) => prefs?.[t]?.in_app !== false),
    byEmail: g.types.some((t) => prefs?.[t]?.email !== false), // props-ok: an on/off preference, not an address
  }));
  return (
    <>
      <h1>Notification settings</h1>
      <p className="lede">Choose what reaches you in the app and by email.</p>
      <NotificationSettings rows={rows} available={prefs !== null} />
    </>
  );
}

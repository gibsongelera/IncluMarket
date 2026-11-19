import { requireRole } from "@/lib/session";
import { getMyProfileBasics } from "@/lib/data";
import { ProfileForms } from "@/components/ProfileForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const session = await requireRole([]);
  const me = await getMyProfileBasics(session.user_id);
  return (
    <>
      <h1>Profile</h1>
      <ProfileForms name={me?.name ?? session.name} phone={me?.phone ?? null} email={session.email} /> {/* props-ok: the signed-in user's own email and phone */}
    </>
  );
}

import { requireRole } from "@/lib/session";
import { getMyPrivacyRequests, getNewsletterStatus, getPersonalizationSetting } from "@/lib/data";
import { PrivacyCentre } from "@/components/PrivacyCentre";
import { PersonalisationToggle } from "@/components/PersonalisationToggle";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy" };

export default async function PrivacyPage() {
  const session = await requireRole([]);
  const [newsletter, requests, personalisation] = await Promise.all([
    getNewsletterStatus(session.email), // props-ok: looks up the signed-in user's own address; only a boolean reaches the page
    getMyPrivacyRequests(session.user_id),
    session.role === "buyer" ? getPersonalizationSetting(session.user_id) : Promise.resolve(null),
  ]);
  return (
    <>
      <h1>Privacy</h1>
      <PrivacyCentre newsletter={newsletter} requests={requests} />
      {personalisation ? (
        <div className="account-grid account-grid--spaced">
          <PersonalisationToggle initial={personalisation.enabled} available={personalisation.available} />
        </div>
      ) : null}
    </>
  );
}

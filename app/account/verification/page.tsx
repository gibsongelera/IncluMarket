import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { sweepPwdVerifications } from "@/lib/pwd/sweep";
import { getMyVerification } from "@/lib/pwd/data";
import { VerificationStatus } from "@/components/VerificationStatus";
import { PwdVerificationFlow } from "@/components/PwdVerificationFlow";

export const dynamic = "force-dynamic";
export const metadata = { title: "PWD verification" };

export default async function VerificationPage() {
  const session = await requireRole([]);
  if (session.role === "admin") redirect("/account");
  // Expiry, renewal reminders and photo retention (throttled; lib/pwd/sweep.ts).
  await sweepPwdVerifications();
  const my = await getMyVerification(session.user_id);

  return (
    <>
      <h1>PWD verification</h1>
      <VerificationStatus my={my} role={session.role} />
      {my.canSubmit ? (
        <PwdVerificationFlow
          role={session.role}
          retentionDays={my.settings.pwd_id_retention_days}
          reviewDays={my.settings.pwd_review_target_days}
          renewal={my.state === "verified" || my.state === "expired"}
        />
      ) : null}
    </>
  );
}

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notify";
import { queueEmail } from "@/lib/email/send";
import { formatDate } from "@/lib/format";

export type VerificationNotice = "submitted" | "approved" | "rejected" | "revoked" | "reminder" | "expired";

interface Extra {
  reason?: string;
  note?: string;
  expiresOn?: string | null;
  days?: number;
  reviewDays?: number;
}

/**
 * Every verification outcome reaches the person twice: in the app and by
 * email (§6). Plain module, not "use server": it must not be callable from
 * the browser.
 */
export async function tellUserAboutVerification(
  profileId: number,
  notice: VerificationNotice,
  extra: Extra = {}
): Promise<void> {
  const db = createAdminClient();
  const { data: person } = await db
    .from("im_profiles")
    .select("name, email, role")
    .eq("id", profileId)
    .maybeSingle();
  const expires = extra.expiresOn ? formatDate(extra.expiresOn) : null;

  const inApp: Record<VerificationNotice, { title: string; body: string }> = {
    submitted: {
      title: "We received your PWD ID",
      body: `We will review it within about ${extra.reviewDays ?? 2} business days.`,
    },
    approved: {
      title: "You are a verified PWD",
      body: expires ? `Your verification is valid until ${expires}.` : "Your verification is active.",
    },
    rejected: { title: "We could not verify your PWD ID", body: `Reason: ${extra.reason ?? "see your account"}` },
    revoked: { title: "Your PWD verification was withdrawn", body: `Reason: ${extra.reason ?? "see your account"}` },
    reminder: {
      title: "Your PWD ID expires soon",
      body: `It expires on ${expires}. Send us your renewed ID to stay verified.`,
    },
    expired: { title: "Your PWD verification has expired", body: "Send us your renewed ID to be verified again." },
  };

  await createNotification({
    userId: profileId,
    type: "pwd_verification",
    title: inApp[notice].title,
    body: inApp[notice].body,
    link: "/account/verification",
  });

  if (person?.email) {
    await queueEmail(
      "pwd_verification",
      { email: person.email, name: person.name ?? undefined },
      {
        status: notice,
        name: person.name,
        role: person.role,
        reason: extra.reason,
        note: extra.note,
        expiresOn: expires,
        days: extra.days,
        reviewDays: extra.reviewDays,
      }
    );
  }
}

/** Audit trail for every verification event, including image views. */
export async function auditVerification(
  actorId: number,
  actorRole: string,
  action: string,
  target: string
): Promise<void> {
  await createAdminClient().from("im_audit_logs").insert({ actor_id: actorId, actor_role: actorRole, action, target });
}

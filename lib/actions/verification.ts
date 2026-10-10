"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { rateLimit, callerFingerprint, RATE_LIMITED_MESSAGE } from "@/lib/security/rate-limit";
import { notifyAdmins } from "@/lib/notify";
import { isMissingObject } from "@/lib/db-errors";
import { getPwdSettings } from "@/lib/settings";
import { checkIdImage } from "@/lib/pwd/image-check";
import { checkExpiry, cleanLgu, daysUntil, idLast4, manilaToday, normalizePwdIdNumber } from "@/lib/pwd/id-number";
import { encryptPwdIdNumber, hashPwdIdNumber, pwdKeysConfigured } from "@/lib/pwd/crypto";
import { auditVerification, tellUserAboutVerification } from "@/lib/pwd/notify";

/**
 * Account → PWD verification → Submit.
 *
 * This is a public HTTP endpoint like every export of a "use server" module,
 * so it trusts nothing from the browser: it re-validates every field,
 * inspects the image bytes itself, and decides who the caller is from the
 * session. Storage paths are generated here and never returned.
 */

export type VerificationField = "consent" | "idNumber" | "issuingLgu" | "expiresOn" | "front" | "back" | "selfie";

export interface SubmitVerificationResult {
  ok: boolean;
  error?: string;
  /** Which step the person should go back to. */
  field?: VerificationField;
}

const CONSENT_PURPOSE =
  "PWD verification: PWD ID number, issuing office, expiry date, photos of the ID (front and back) and a photo " +
  "of the holder with the ID, used only to confirm PWD status for selling and PWD discounts; viewed only by " +
  "InclusiveMarket administrators; photos deleted after the review period set by the platform.";

const PHOTO_LABEL: Record<"front" | "back" | "selfie", string> = {
  front: "photo of the front of your ID",
  back: "photo of the back of your ID",
  selfie: "photo of you holding your ID",
};

const DUPLICATE_MESSAGE =
  "This PWD ID number is already in use on another InclusiveMarket account. If it is yours, contact us — " +
  "our team has been alerted.";

const UNAVAILABLE = "PWD verification is not available right now. Please try again later.";

function fail(error: string, field?: VerificationField): SubmitVerificationResult {
  return { ok: false, error, field };
}

export async function submitPwdVerification(form: FormData): Promise<SubmitVerificationResult> {
  try {
    const session = await getSession();
    if (!session) return fail("Please sign in again, then send your ID.");
    if (session.role === "admin") return fail("Administrators review IDs rather than submit them.");
    if (!pwdKeysConfigured()) {
      console.error("[pwd] PWD_ID_HASH_KEY / PWD_ID_ENC_KEY are not set; verification is disabled.");
      return fail(UNAVAILABLE);
    }

    // --- Rate limits (per account and per network) ------------------------
    const [byUser, byIp] = await Promise.all([
      rateLimit("pwd_submit", `user:${session.user_id}`, { limit: 5, windowSeconds: 86_400 }),
      rateLimit("pwd_submit_ip", await callerFingerprint(), { limit: 20, windowSeconds: 3_600 }),
    ]);
    if (!byUser.ok || !byIp.ok) return fail(RATE_LIMITED_MESSAGE);

    // --- Fields ---------------------------------------------------------------
    if (form.get("consent") !== "yes") return fail("Please read and agree to how we use your ID first.", "consent");

    const number = normalizePwdIdNumber(String(form.get("idNumber") ?? ""));
    if (!number) return fail("Enter your PWD ID number as printed, for example 09-7317-000-0001234.", "idNumber");
    const lgu = cleanLgu(String(form.get("issuingLgu") ?? ""));
    if (!lgu.ok) return fail(lgu.error, "issuingLgu");
    const expiresOn = String(form.get("expiresOn") ?? "");
    const expiry = checkExpiry(expiresOn);
    if (!expiry.ok) return fail(expiry.error, "expiresOn");

    const photos: Partial<Record<"front" | "back" | "selfie", { bytes: Uint8Array; ext: string; type: string }>> = {};
    for (const side of ["front", "back", "selfie"] as const) {
      const file = form.get(side);
      if (!(file instanceof File) || file.size === 0) return fail(`Add the ${PHOTO_LABEL[side]}.`, side);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const checked = checkIdImage(bytes, PHOTO_LABEL[side]);
      if (!checked.ok) return fail(checked.error, side);
      photos[side] = {
        bytes,
        ext: checked.kind === "png" ? "png" : "jpg",
        type: checked.kind === "png" ? "image/png" : "image/jpeg",
      };
    }

    const db = createAdminClient();
    const settings = await getPwdSettings();

    // --- Current state --------------------------------------------------------
    const { data: mine, error: mineErr } = await db
      .from("im_pwd_verifications")
      .select("id, status, expires_on")
      .eq("profile_id", session.user_id)
      .in("status", ["submitted", "approved"]);
    if (mineErr) {
      if (isMissingObject(mineErr)) return fail(UNAVAILABLE);
      return fail("We could not check your account. Please try again.");
    }
    if (mine?.some((r) => r.status === "submitted")) {
      return fail("We are already reviewing an ID from you. We will tell you when we have decided.");
    }
    const today = manilaToday();
    const active = mine?.find((r) => r.status === "approved" && (!r.expires_on || r.expires_on >= today));
    if (active && (!active.expires_on || daysUntil(active.expires_on, today) > settings.pwd_renewal_reminder_days)) {
      return fail("You are already verified. You can send a renewed ID when your current one is close to expiring.");
    }

    // --- One ID number, one account ---------------------------------------------
    const hash = hashPwdIdNumber(number);
    const sealed = encryptPwdIdNumber(number);
    if (!hash || !sealed) return fail(UNAVAILABLE);
    const last4 = idLast4(number);

    const { data: other } = await db
      .from("im_pwd_verifications")
      .select("id")
      .eq("id_number_hash", hash)
      .in("status", ["submitted", "approved"])
      .neq("profile_id", session.user_id)
      .limit(1)
      .maybeSingle();
    if (other) {
      await flagDuplicate(session.user_id, session.role, hash, last4, other.id);
      return fail(DUPLICATE_MESSAGE, "idNumber");
    }

    // --- Consent (RA 10173) -----------------------------------------------------
    const { data: consent } = await db
      .from("im_consent_logs")
      .insert({ user_id: session.user_id, action: "pwd_verification_submit", consent: true, purpose: CONSENT_PURPOSE })
      .select("id")
      .single();

    // --- Photos to the private bucket ------------------------------------------------
    const batch = randomUUID();
    const paths: Record<string, string> = {};
    const bucket = db.storage.from("pwd-ids");
    for (const side of ["front", "back", "selfie"] as const) {
      const photo = photos[side]!;
      const path = `${session.user_id}/${batch}-${side}.${photo.ext}`;
      const { error } = await bucket.upload(path, photo.bytes, { contentType: photo.type, upsert: false });
      if (error) {
        console.error(`[pwd] upload ${side}: ${error.message}`);
        if (Object.keys(paths).length) await bucket.remove(Object.values(paths));
        return fail("We could not save your photos. Please try again.");
      }
      paths[side] = path;
    }

    // --- The submission ------------------------------------------------------------
    const { data: row, error } = await db
      .from("im_pwd_verifications")
      .insert({
        profile_id: session.user_id,
        method: "id_scan",
        id_number_hash: hash,
        id_number_last4: last4,
        id_number_encrypted: sealed,
        issuing_lgu: lgu.value,
        expires_on: expiresOn,
        front_path: paths.front,
        back_path: paths.back,
        selfie_path: paths.selfie,
        status: "submitted",
        consent_log_id: consent?.id ?? null,
      })
      .select("id")
      .single();
    if (error || !row) {
      await bucket.remove(Object.values(paths));
      const text = `${error?.message ?? ""} ${(error as { details?: string } | null)?.details ?? ""}`;
      if (error?.code === "23505" && /another account|other_account|number_submitted|number_approved/.test(text)) {
        await flagDuplicate(session.user_id, session.role, hash, last4, null);
        return fail(DUPLICATE_MESSAGE, "idNumber");
      }
      if (error?.code === "23505") {
        return fail("We are already reviewing an ID from you. We will tell you when we have decided.");
      }
      console.error(`[pwd] insert: ${error?.message}`);
      return fail("We could not send your ID. Please try again.");
    }

    await auditVerification(session.user_id, session.role, "pwd_submitted", `verification:${row.id}`);
    await tellUserAboutVerification(session.user_id, "submitted", { reviewDays: settings.pwd_review_target_days });
    await notifyAdmins({
      type: "pwd_verification",
      title: "A PWD ID is waiting for review",
      body: `${session.role === "seller" ? "Seller" : "Buyer"} ${session.name} sent an ID ending ${last4}.`,
      link: "/admin/verifications",
    });

    revalidatePath("/account/verification");
    revalidatePath("/account");
    return { ok: true };
  } catch (err) {
    console.error("[pwd] submit failed:", err);
    return fail("Something went wrong while sending your ID. Please try again.");
  }
}

async function flagDuplicate(
  profileId: number,
  role: string,
  hash: string,
  last4: string,
  existingId: number | null
): Promise<void> {
  const db = createAdminClient();
  await db.from("im_pwd_verification_flags").insert({
    profile_id: profileId,
    id_number_hash: hash,
    existing_verification_id: existingId,
    kind: "duplicate_id",
    note: `Blocked: ID ending ${last4} is active on another account.`,
  });
  await auditVerification(profileId, role, "pwd_duplicate_blocked", `profile:${profileId}`);
  await notifyAdmins({
    type: "pwd_verification",
    title: "Duplicate PWD ID number blocked",
    body: `An account tried to verify with an ID number (ending ${last4}) that is active on another account.`,
    link: "/admin/verifications?view=flags",
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { isMissingObject } from "@/lib/db-errors";
import { boundedText } from "@/lib/validation/data-url";
import {
  REJECT_REASONS,
  checkExpiry,
  cleanLgu,
  idLast4,
  normalizePwdIdNumber,
  rejectReasonLabel,
} from "@/lib/pwd/id-number";
import { decryptPwdIdNumber, hashPwdIdNumber } from "@/lib/pwd/crypto";
import { auditVerification, tellUserAboutVerification } from "@/lib/pwd/notify";

/**
 * Admin side of PWD verification (/admin/verifications). Every export is a
 * public endpoint: each one checks for an admin session first, and every
 * look at an ID image or the full number is written to im_audit_logs.
 */

export interface AdminActionResult {
  ok: boolean;
  error?: string;
}

const SIGNED_URL_SECONDS = 60;

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

function done() {
  revalidatePath("/admin/verifications");
}

export async function viewVerificationImages(
  verificationId: number
): Promise<AdminActionResult & { images?: { side: "front" | "back" | "selfie"; url: string }[]; expiresIn?: number }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const db = createAdminClient();
  const { data: row } = await db
    .from("im_pwd_verifications")
    .select("id, front_path, back_path, selfie_path, images_deleted_at")
    .eq("id", verificationId)
    .maybeSingle();
  if (!row) return { ok: false, error: "That verification no longer exists." };
  if (row.images_deleted_at || !row.front_path) {
    return { ok: false, error: "The photos were deleted under the retention rule. The decision record is kept." };
  }
  const sides = (["front", "back", "selfie"] as const).filter((s) => row[`${s}_path`]);
  const paths = sides.map((s) => row[`${s}_path`] as string);
  const { data: signed, error } = await db.storage.from("pwd-ids").createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error || !signed) return { ok: false, error: "Could not open the photos. Please try again." };

  await auditVerification(admin.user_id, "admin", "pwd_images_viewed", `verification:${verificationId}`);
  return {
    ok: true,
    expiresIn: SIGNED_URL_SECONDS,
    images: sides
      .map((side, i) => ({ side, url: signed[i]?.signedUrl ?? "" }))
      .filter((img) => img.url),
  };
}

export async function revealVerificationNumber(
  verificationId: number
): Promise<AdminActionResult & { number?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const { data: row } = await createAdminClient()
    .from("im_pwd_verifications")
    .select("status, id_number_encrypted")
    .eq("id", verificationId)
    .maybeSingle();
  if (!row) return { ok: false, error: "That verification no longer exists." };
  if (row.status !== "submitted" || !row.id_number_encrypted) {
    return { ok: false, error: "The full number is wiped once a decision is made." };
  }
  const number = decryptPwdIdNumber(row.id_number_encrypted);
  if (!number) return { ok: false, error: "The number could not be read. Check PWD_ID_ENC_KEY." };
  await auditVerification(admin.user_id, "admin", "pwd_number_revealed", `verification:${verificationId}`);
  return { ok: true, number };
}

const REGISTRY = ["found", "not_found", "not_checked"] as const;
type Registry = (typeof REGISTRY)[number];

export async function decideVerification(
  verificationId: number,
  decision: "approved" | "rejected",
  input: { reasonCode?: string; reason?: string; registryResult?: string; registryNote?: string }
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  if (decision !== "approved" && decision !== "rejected") return { ok: false, error: "Choose approve or reject." };

  const registry: Registry = REGISTRY.includes(input.registryResult as Registry)
    ? (input.registryResult as Registry)
    : "not_checked";
  const registryNote = boundedText(input.registryNote ?? "", 500);
  const reason = boundedText(input.reason ?? "", 500);
  const reasonCode = decision === "rejected" ? String(input.reasonCode ?? "") : null;
  if (decision === "rejected") {
    if (!REJECT_REASONS.some((r) => r.code === reasonCode)) return { ok: false, error: "Choose a reason for rejecting." };
    if (reasonCode === "other" && (!reason || reason.length < 5)) {
      return { ok: false, error: "Explain the reason in a sentence — the person will read it." };
    }
  }

  const db = createAdminClient();
  const { data: row } = await db
    .from("im_pwd_verifications")
    .select("profile_id, expires_on")
    .eq("id", verificationId)
    .maybeSingle();
  if (!row) return { ok: false, error: "That verification no longer exists." };

  const { data: code, error } = await db.rpc("im_decide_pwd_verification", {
    p_id: verificationId,
    p_decision: decision,
    p_reviewer: admin.user_id,
    p_reason_code: reasonCode,
    p_reason: reason || null,
    p_registry_result: registry,
    p_registry_note: registryNote || null,
  });
  if (error) {
    if (isMissingObject(error)) return { ok: false, error: "Apply migration 0017 first." };
    if (error.code === "23505") {
      return { ok: false, error: "This ID number is already approved on another account. Reject this one and check the flags." };
    }
    console.error(`[pwd] decide: ${error.message}`);
    return { ok: false, error: "Could not save the decision. Please try again." };
  }
  const messages: Record<string, string> = {
    not_found: "That verification no longer exists.",
    not_submitted: "Someone already decided this one. The list has been refreshed.",
    reason_required: "Choose a reason for rejecting.",
    expired_id: "This ID has expired since it was sent. Reject it with the reason “The ID has expired”.",
    invalid: "Choose approve or reject.",
  };
  if (code !== "ok") {
    done();
    return { ok: false, error: messages[String(code)] ?? "Could not save the decision." };
  }

  await auditVerification(
    admin.user_id,
    "admin",
    decision === "approved" ? "pwd_approved" : "pwd_rejected",
    `verification:${verificationId} registry:${registry}${reasonCode ? ` reason:${reasonCode}` : ""}`
  );
  if (decision === "approved") {
    await tellUserAboutVerification(row.profile_id, "approved", { expiresOn: row.expires_on });
  } else {
    await tellUserAboutVerification(row.profile_id, "rejected", {
      reason: rejectReasonLabel(reasonCode),
      note: reason || undefined,
    });
  }
  done();
  return { ok: true };
}

export async function revokeVerification(verificationId: number, why: string): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const reason = boundedText(why ?? "", 500);
  if (!reason || reason.length < 5) return { ok: false, error: "Explain why in a sentence — the person will read it." };

  const db = createAdminClient();
  const { data, error } = await db
    .from("im_pwd_verifications")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: admin.user_id,
      revoke_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", verificationId)
    .eq("status", "approved")
    .select("profile_id")
    .maybeSingle();
  if (error) return { ok: false, error: "Could not revoke. Please try again." };
  if (!data) return { ok: false, error: "Only an active approval can be revoked." };

  await auditVerification(admin.user_id, "admin", "pwd_revoked", `verification:${verificationId} reason:${reason}`);
  await tellUserAboutVerification(data.profile_id, "revoked", { reason });
  done();
  return { ok: true };
}

/**
 * The "AVRC in person" route for sellers AVRC staff already know (Q4). The
 * admin types the number and expiry from the physical ID, so the
 * one-account-per-number rule and expiry reminders still apply; there are no
 * photos to store. Never automatic: one admin, one person, one note.
 */
export async function verifyInPerson(
  profileId: number,
  input: { idNumber: string; issuingLgu: string; expiresOn: string; note: string }
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };

  const number = normalizePwdIdNumber(input.idNumber);
  if (!number) return { ok: false, error: "Enter the 16-digit PWD ID number from the card." };
  const lgu = cleanLgu(input.issuingLgu);
  if (!lgu.ok) return { ok: false, error: lgu.error };
  const expiry = checkExpiry(input.expiresOn);
  if (!expiry.ok) return { ok: false, error: expiry.error };
  const note = boundedText(input.note ?? "", 500);
  if (!note || note.length < 10) {
    return { ok: false, error: "Say where and when you saw the ID, for example “Seen at AVRC on 12 Oct”." };
  }
  const hash = hashPwdIdNumber(number);
  if (!hash) return { ok: false, error: "PWD_ID_HASH_KEY is not set." };

  const db = createAdminClient();
  const { data: person } = await db
    .from("im_profiles")
    .select("id, role, account_status")
    .eq("id", profileId)
    .maybeSingle();
  if (!person || person.role === "admin") return { ok: false, error: "Choose a buyer or seller account." };
  if (person.account_status !== "active") return { ok: false, error: "This account is suspended." };

  const { data: current } = await db.from("im_verified_pwd").select("profile_id").eq("profile_id", profileId).maybeSingle();
  if (current) return { ok: false, error: "This person is already verified." };

  const now = new Date().toISOString();
  const { data: row, error } = await db
    .from("im_pwd_verifications")
    .insert({
      profile_id: profileId,
      method: "avrc_in_person",
      id_number_hash: hash,
      id_number_last4: idLast4(number),
      issuing_lgu: lgu.value,
      expires_on: input.expiresOn,
      status: "approved",
      registry_result: "not_checked",
      registry_check_note: note,
      reviewer_id: admin.user_id,
      reviewed_at: now,
    })
    .select("id")
    .single();
  if (error || !row) {
    if (error?.code === "23505") return { ok: false, error: "This ID number is already in use on another account." };
    if (error && isMissingObject(error)) return { ok: false, error: "Apply migration 0017 first." };
    return { ok: false, error: "Could not save. Please try again." };
  }

  await auditVerification(admin.user_id, "admin", "pwd_verified_in_person", `verification:${row.id} profile:${profileId}`);
  await tellUserAboutVerification(profileId, "approved", { expiresOn: input.expiresOn });
  done();
  return { ok: true };
}

export async function resolveVerificationFlag(flagId: number): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const { data, error } = await createAdminClient()
    .from("im_pwd_verification_flags")
    .update({ resolved_at: new Date().toISOString(), resolved_by: admin.user_id })
    .eq("id", flagId)
    .is("resolved_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Could not update the flag. Please try again." };
  if (!data) return { ok: false, error: "That flag was already resolved." };
  await auditVerification(admin.user_id, "admin", "pwd_flag_resolved", `flag:${flagId}`);
  done();
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { isMissingObject } from "@/lib/db-errors";
import { rateLimit } from "@/lib/security/rate-limit";
import { createNotification } from "@/lib/notify";
import { hashPwdIdNumber } from "@/lib/pwd/crypto";
import { isVerifiedPwd } from "@/lib/pwd/data";
import { auditVerification } from "@/lib/pwd/notify";
import { emailSetPasswordLink } from "@/lib/auth/set-password-email";
import { checkSellerSetup, type SellerSetupErrors, type SellerSetupInput } from "@/lib/seller-setup";
import { SELLER_RULES } from "@/lib/seller-setup-rules";

/**
 * Admin → Users → Set up a seller: AVRC staff make a PWD trainee's seller
 * account from the person's details and their PWD ID card, seen in person.
 * The person then chooses their own password from the emailed link. No
 * administrator sets it or sees it.
 *
 * Every export is a public endpoint, and each one checks for an admin
 * session first.
 */

export interface SellerSetupResult {
  ok: boolean;
  error?: string;
  /** Per field, in the form's words: the form shows each under its field. */
  errors?: SellerSetupErrors;
  userId?: number;
  /** Whether the mail provider accepted the set-password email. */
  emailSent?: boolean;
}

export interface SetupEmailResult {
  ok: boolean;
  error?: string;
}

type Db = ReturnType<typeof createAdminClient>;

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

async function audit(db: Db, actorId: number, action: string, target: string) {
  await db.from("im_audit_logs").insert({ actor_id: actorId, actor_role: "admin", action, target });
}

/** ILIKE treats "_" and "%" as wildcards, and an address may contain "_". */
function exactly(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Take back a half-made account: the profile (its verification goes with it,
 * on delete cascade), then the sign-in. Nothing else points at it yet.
 */
async function undo(db: Db, authId: string, profileId: number | null) {
  const del = db.from("im_profiles").delete();
  await (profileId != null ? del.eq("id", profileId) : del.eq("auth_user_id", authId));
  const { error } = await db.auth.admin.deleteUser(authId);
  if (error) console.error(`[seller-setup] could not remove the half-made sign-in: ${error.message}`);
}

const FIX = "Check the fields marked below.";
const ID_IN_USE = "This PWD ID number is already in use on another account.";

export async function createSellerAccount(input: SellerSetupInput): Promise<SellerSetupResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };

  const checked = checkSellerSetup(input ?? {}, SELLER_RULES);
  if (!checked.ok) return { ok: false, error: FIX, errors: checked.errors };
  const v = checked.value;

  const hash = hashPwdIdNumber(v.idNumber);
  if (!hash) {
    return { ok: false, error: "PWD ID numbers cannot be recorded: PWD_ID_HASH_KEY is not set on the server." };
  }

  const db = createAdminClient();

  // A new address only: an existing account becomes a seller on Users.
  const { data: same, error: sameErr } = await db
    .from("im_profiles")
    .select("id")
    .ilike("email", exactly(v.email))
    .limit(1);
  if (sameErr) return { ok: false, error: "Could not check the email address. Please try again." };
  if (same?.length) {
    return {
      ok: false,
      error: FIX,
      errors: { email: "An account already uses this email. Find it on Users and change its role to seller instead." },
    };
  }

  // One PWD ID number, one account. The database refuses it too (0017);
  // asking first means no sign-in is made only to be taken back.
  const { data: taken, error: takenErr } = await db
    .from("im_pwd_verifications")
    .select("id")
    .eq("id_number_hash", hash)
    .in("status", ["submitted", "approved"])
    .limit(1);
  if (takenErr) {
    return {
      ok: false,
      error: isMissingObject(takenErr)
        ? "Recording a PWD ID needs database migration 0017."
        : "Could not check the PWD ID number. Please try again.",
    };
  }
  if (taken?.length) {
    await audit(db, admin.user_id, "seller_setup_id_in_use", `verification:${taken[0].id}`);
    return { ok: false, error: FIX, errors: { idNumber: ID_IN_USE } };
  }

  // The sign-in is confirmed, because AVRC staff know the person and the
  // address. It has no password, so nobody can sign in until the person
  // chooses one from the email.
  const { data: made, error: madeErr } = await db.auth.admin.createUser({
    email: v.email,
    email_confirm: true,
    user_metadata: { name: v.name },
  });
  if (madeErr || !made?.user) {
    return /already|registered|exists/i.test(madeErr?.message ?? "")
      ? { ok: false, error: FIX, errors: { email: "This email address already has a sign-in. Find the account on Users instead." } }
      : { ok: false, error: "Could not create the sign-in. Please try again." };
  }
  const authId = made.user.id;
  const now = new Date().toISOString();

  // on_auth_user_created made a buyer profile (0025). This turns it into the seller.
  const { data: profile, error: profileErr } = await db
    .from("im_profiles")
    .update({
      name: v.name,
      role: "seller",
      phone: v.phone,
      disability_type: v.disability,
      assistive_needs: v.needs,
      shop_name: v.shopName,
      pickup_city: v.city,
      seller_story: v.story,
      updated_at: now,
    })
    .eq("auth_user_id", authId)
    .select("id")
    .maybeSingle();
  if (profileErr || !profile) {
    await undo(db, authId, null);
    return {
      ok: false,
      error:
        profileErr && isMissingObject(profileErr)
          ? "Shop names need database migration 0019."
          : "Could not save the seller's details, so nothing was created. Please try again.",
    };
  }
  const userId = Number(profile.id);

  // The card, seen in person: the "AVRC in person" route (0017), recorded
  // as Verify in person records it.
  const { data: ver, error: verErr } = await db
    .from("im_pwd_verifications")
    .insert({
      profile_id: userId,
      method: "avrc_in_person",
      id_number_hash: hash,
      id_number_last4: v.idLast4,
      issuing_lgu: v.lgu,
      expires_on: v.expiresOn,
      status: "approved",
      registry_result: "not_checked",
      registry_check_note: v.seenNote,
      reviewer_id: admin.user_id,
      reviewed_at: now,
    })
    .select("id")
    .single();
  if (verErr || !ver) {
    await undo(db, authId, userId);
    if (verErr?.code === "23505") return { ok: false, error: FIX, errors: { idNumber: ID_IN_USE } };
    return { ok: false, error: "Could not record the PWD ID, so nothing was created. Please try again." };
  }

  await db.from("im_consent_logs").insert({
    user_id: userId,
    action: "account_created_by_admin",
    consent: true,
    purpose: "RA 10173 consent to a seller account and a PWD ID check, given in person to AVRC staff (admin-recorded)",
  });
  await audit(db, admin.user_id, "created_seller_account", `user:${userId}`);
  await auditVerification(admin.user_id, "admin", "pwd_verified_in_person", `verification:${ver.id} profile:${userId}`);
  await createNotification({
    userId,
    type: "system",
    title: "Welcome to InclusiveMarket",
    body: `AVRC staff set up your shop, ${v.shopName}, and verified your PWD ID. You can add your first product now.`,
    link: "/seller/products",
  });

  const emailSent = await emailSetPasswordLink(
    db,
    { email: v.email, name: v.name },
    { seller: true, shopName: v.shopName, verified: true }
  );
  if (!emailSent) await audit(db, admin.user_id, "account_setup_email_failed", `user:${userId}`);

  revalidatePath("/admin/users");
  revalidatePath("/admin/verifications");
  return { ok: true, userId, emailSent };
}

/**
 * Send the set-password email again. The link lasts an hour, and email goes
 * astray. Any active account can be sent one; the link only reaches the
 * account's own mailbox.
 */
export async function resendAccountSetupEmail(userId: number): Promise<SetupEmailResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "User not found." };

  const limited = await rateLimit("account_setup_email", `user:${id}`, { limit: 5, windowSeconds: 3600 });
  if (!limited.ok) {
    return { ok: false, error: "This email was sent several times in the last hour. Please wait a while before sending it again." };
  }

  const db = createAdminClient();
  const { data: who } = await db
    .from("im_profiles")
    .select("id, name, email, role, account_status, auth_user_id, shop_name")
    .eq("id", id)
    .maybeSingle();
  if (!who?.email || !who.auth_user_id) return { ok: false, error: "This account has no sign-in." };
  if (who.account_status !== "active") return { ok: false, error: "Restore the account before sending it an email." };

  const seller = who.role === "seller";
  const sent = await emailSetPasswordLink(
    db,
    { email: String(who.email), name: String(who.name ?? "") },
    { seller, shopName: who.shop_name as string | null, verified: seller ? await isVerifiedPwd(id) : false }
  );
  if (!sent) return { ok: false, error: "The email could not be sent. Please try again in a few minutes." };
  await audit(db, admin.user_id, "sent_account_setup_email", `user:${id}`);
  return { ok: true };
}

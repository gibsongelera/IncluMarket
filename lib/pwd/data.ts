import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DataUnavailableError } from "@/lib/data";
import { isMissingObject } from "@/lib/db-errors";
import { getPwdSettings, type PwdSettings } from "@/lib/settings";
import { daysUntil, manilaToday, rejectReasonLabel, type VerificationStatus } from "./id-number";

/**
 * Reads for PWD verification. Storage paths and the encrypted number never
 * leave this module: every DTO below is safe to pass to a client component.
 */

type Method = "id_scan" | "avrc_in_person";

interface VerificationRow {
  id: number;
  profile_id: number;
  method: Method;
  id_number_last4: string | null;
  issuing_lgu: string | null;
  expires_on: string | null;
  status: VerificationStatus;
  reason_code: string | null;
  reason: string | null;
  revoke_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  revoked_at: string | null;
}

const ROW_FIELDS =
  "id, profile_id, method, id_number_last4, issuing_lgu, expires_on, status, reason_code, reason, revoke_reason, submitted_at, reviewed_at, revoked_at";

export interface VerificationLite {
  id: number;
  status: VerificationStatus;
  method: Method;
  last4: string | null;
  issuingLgu: string | null;
  expiresOn: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  /** Rejection reason as the user should read it. */
  reasonLabel: string | null;
  reasonText: string | null;
  revokeReason: string | null;
}

function lite(r: VerificationRow): VerificationLite {
  return {
    id: r.id,
    status: r.status,
    method: r.method,
    last4: r.id_number_last4,
    issuingLgu: r.issuing_lgu,
    expiresOn: r.expires_on,
    submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at,
    reasonLabel: r.status === "rejected" ? rejectReasonLabel(r.reason_code) : null,
    reasonText: r.status === "rejected" ? r.reason : null,
    revokeReason: r.status === "revoked" ? r.revoke_reason : null,
  };
}

export type MyVerificationState =
  | "unavailable" // migration 0017 not applied
  | "none"
  | "submitted"
  | "verified"
  | "rejected"
  | "revoked"
  | "expired";

export interface MyVerificationLite {
  state: MyVerificationState;
  /** The approval in force, if any. */
  active: VerificationLite | null;
  /** A submission waiting for review (first time, or a renewal). */
  pending: VerificationLite | null;
  /** The most recent closed outcome, when that is what the user needs to see. */
  latest: VerificationLite | null;
  daysLeft: number | null;
  renewalDue: boolean;
  canSubmit: boolean;
  /** Sellers only: listings stay live until this date while unverified. */
  graceUntil: string | null;
  settings: PwdSettings;
}

export async function getMyVerification(profileId: number): Promise<MyVerificationLite> {
  const db = createAdminClient();
  const settings = await getPwdSettings();
  const base: MyVerificationLite = {
    state: "none",
    active: null,
    pending: null,
    latest: null,
    daysLeft: null,
    renewalDue: false,
    canSubmit: true,
    graceUntil: null,
    settings,
  };

  const [{ data, error }, profile] = await Promise.all([
    db.from("im_pwd_verifications").select(ROW_FIELDS).eq("profile_id", profileId).order("submitted_at", { ascending: false }).limit(10),
    db.from("im_profiles").select("pwd_grace_until").eq("id", profileId).maybeSingle(),
  ]);
  if (error) {
    if (isMissingObject(error)) return { ...base, state: "unavailable", canSubmit: false };
    console.error(`[pwd] my verification: ${error.message}`);
    throw new DataUnavailableError("your PWD verification");
  }
  const graceUntil = (profile.data as { pwd_grace_until?: string | null } | null)?.pwd_grace_until ?? null;
  base.graceUntil = graceUntil && Date.parse(graceUntil) > Date.now() ? graceUntil : null;

  const rows = (data ?? []) as VerificationRow[];
  const today = manilaToday();
  const pendingRow = rows.find((r) => r.status === "submitted") ?? null;
  const activeRow =
    rows.find((r) => r.status === "approved" && (!r.expires_on || r.expires_on >= today)) ?? null;
  const closed = rows.find((r) => r.status !== "submitted") ?? null;

  const active = activeRow ? lite(activeRow) : null;
  const pending = pendingRow ? lite(pendingRow) : null;
  const daysLeft = active?.expiresOn ? daysUntil(active.expiresOn, today) : null;
  const renewalDue = daysLeft !== null && daysLeft <= settings.pwd_renewal_reminder_days;

  if (active) {
    return {
      ...base,
      state: "verified",
      active,
      pending,
      daysLeft,
      renewalDue,
      // A renewal can be sent once the reminder window opens.
      canSubmit: !pending && renewalDue,
    };
  }
  if (pending) return { ...base, state: "submitted", pending, canSubmit: false };
  if (!closed) return base;

  // An approval whose date has passed reads as expired even before the sweep
  // updates its status.
  const latest = lite(closed);
  const state: MyVerificationState =
    closed.status === "approved" || closed.status === "expired"
      ? "expired"
      : closed.status === "revoked"
        ? "revoked"
        : "rejected";
  return { ...base, state, latest, canSubmit: true };
}

/** Is this profile a verified PWD right now? (badge, selling, discount) */
export async function isVerifiedPwd(profileId: number): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("im_verified_pwd")
    .select("profile_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

/** Verified sellers among these ids (badge on cards, shop page, product page). */
export async function verifiedAmong(profileIds: number[]): Promise<Set<number>> {
  const ids = [...new Set(profileIds)].filter((n) => Number.isFinite(n));
  if (!ids.length) return new Set();
  const { data, error } = await createAdminClient().from("im_verified_pwd").select("profile_id").in("profile_id", ids);
  if (error) return new Set();
  return new Set(((data ?? []) as { profile_id: number }[]).map((r) => r.profile_id));
}

/**
 * Like verifiedAmong(), but null when verification does not exist yet
 * (before migration 0017) — so a caller can tell "nobody is verified" from
 * "verification is not switched on".
 */
export async function verifiedAmongIfAvailable(profileIds: number[]): Promise<Set<number> | null> {
  const ids = [...new Set(profileIds)].filter((n) => Number.isFinite(n));
  const { data, error } = await createAdminClient()
    .from("im_verified_pwd")
    .select("profile_id")
    .in("profile_id", ids.length ? ids : [0]);
  if (error) return isMissingObject(error) ? null : new Set();
  return new Set(((data ?? []) as { profile_id: number }[]).map((r) => r.profile_id));
}

/** Last four digits of the IDs behind given verifications (seller delivery check). */
export async function verificationLast4(ids: number[]): Promise<Map<number, string | null>> {
  const unique = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  if (!unique.length) return new Map();
  const { data, error } = await createAdminClient()
    .from("im_pwd_verifications")
    .select("id, id_number_last4")
    .in("id", unique);
  if (error) return new Map();
  return new Map(((data ?? []) as { id: number; id_number_last4: string | null }[]).map((r) => [r.id, r.id_number_last4]));
}

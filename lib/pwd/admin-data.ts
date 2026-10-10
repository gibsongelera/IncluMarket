import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DataUnavailableError } from "@/lib/data";
import { isMissingObject } from "@/lib/db-errors";
import { manilaToday, rejectReasonLabel, type VerificationStatus } from "./id-number";

/**
 * Admin reads for the verification queue (/admin/verifications). Like
 * lib/pwd/data.ts, nothing here returns a storage path or the sealed number:
 * images are fetched on demand as 60-second signed URLs through an audited
 * action, and so is the full number.
 */

export type AdminVerificationView = "queue" | "decided" | "sellers" | "flags";

export interface AdminVerificationLite {
  id: number;
  profileId: number;
  name: string;
  role: string;
  method: "id_scan" | "avrc_in_person";
  last4: string | null;
  issuingLgu: string | null;
  expiresOn: string | null;
  expired: boolean;
  status: VerificationStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewerName: string | null;
  registryResult: string | null;
  registryNote: string | null;
  reasonLabel: string | null;
  reason: string | null;
  revokeReason: string | null;
  hasImages: boolean;
  /** The sealed full number is still held (pending decisions only). */
  canRevealNumber: boolean;
  /** Earlier submissions by the same person. */
  priorCount: number;
  /** Unresolved duplicate-number flags raised by this person. */
  openFlags: number;
}

export interface UnverifiedSellerLite {
  profileId: number;
  name: string;
  graceUntil: string | null;
  listings: number;
  pending: boolean;
}

export interface VerificationFlagLite {
  id: number;
  profileId: number;
  name: string;
  kind: string;
  note: string | null;
  createdAt: string;
  existingOwnerName: string | null;
}

export interface AdminVerificationData {
  available: boolean;
  counts: Record<AdminVerificationView, number>;
  rows: AdminVerificationLite[];
  sellers: UnverifiedSellerLite[];
  flags: VerificationFlagLite[];
}

interface Row {
  id: number;
  profile_id: number;
  method: "id_scan" | "avrc_in_person";
  id_number_last4: string | null;
  id_number_encrypted: string | null;
  issuing_lgu: string | null;
  expires_on: string | null;
  status: VerificationStatus;
  front_path: string | null;
  images_deleted_at: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewer_id: number | null;
  registry_result: string | null;
  registry_check_note: string | null;
  reason_code: string | null;
  reason: string | null;
  revoke_reason: string | null;
}

const FIELDS =
  "id, profile_id, method, id_number_last4, id_number_encrypted, issuing_lgu, expires_on, status, front_path, images_deleted_at, submitted_at, reviewed_at, reviewer_id, registry_result, registry_check_note, reason_code, reason, revoke_reason";

async function names(ids: number[]): Promise<Map<number, { name: string; role: string }>> {
  const unique = [...new Set(ids.filter((n) => Number.isFinite(n)))];
  if (!unique.length) return new Map();
  const { data } = await createAdminClient().from("im_profiles").select("id, name, role").in("id", unique);
  return new Map(((data ?? []) as { id: number; name: string; role: string }[]).map((p) => [p.id, { name: p.name, role: p.role }]));
}

export async function getAdminVerificationData(view: AdminVerificationView): Promise<AdminVerificationData> {
  const db = createAdminClient();
  const empty: AdminVerificationData = {
    available: false,
    counts: { queue: 0, decided: 0, sellers: 0, flags: 0 },
    rows: [],
    sellers: [],
    flags: [],
  };

  const [queueCount, flagCount] = await Promise.all([
    db.from("im_pwd_verifications").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    db.from("im_pwd_verification_flags").select("id", { count: "exact", head: true }).is("resolved_at", null),
  ]);
  if (queueCount.error) {
    if (isMissingObject(queueCount.error)) return empty;
    console.error(`[pwd] queue count: ${queueCount.error.message}`);
    throw new DataUnavailableError("the verification queue");
  }

  const sellers = await getUnverifiedSellers();
  const out: AdminVerificationData = {
    available: true,
    counts: { queue: queueCount.count ?? 0, decided: 0, sellers: sellers.length, flags: flagCount.count ?? 0 },
    rows: [],
    sellers: view === "sellers" ? sellers : [],
    flags: [],
  };

  if (view === "flags") {
    out.flags = await getOpenFlags();
    return out;
  }
  if (view === "sellers") return out;

  const query = db.from("im_pwd_verifications").select(FIELDS);
  const { data, error } =
    view === "queue"
      ? await query.eq("status", "submitted").order("submitted_at", { ascending: true }).limit(100)
      : await query.neq("status", "submitted").order("updated_at", { ascending: false }).limit(100);
  if (error) {
    console.error(`[pwd] queue: ${error.message}`);
    throw new DataUnavailableError("the verification queue");
  }
  const rows = (data ?? []) as Row[];
  const profileIds = rows.map((r) => r.profile_id);
  const who = await names([...profileIds, ...rows.map((r) => r.reviewer_id ?? NaN)]);

  // Prior submissions and open flags per person, for context at review time.
  const prior = new Map<number, number>();
  const flagsBy = new Map<number, number>();
  if (profileIds.length) {
    const [{ data: history }, { data: flags }] = await Promise.all([
      db.from("im_pwd_verifications").select("profile_id").in("profile_id", profileIds),
      db.from("im_pwd_verification_flags").select("profile_id").in("profile_id", profileIds).is("resolved_at", null),
    ]);
    for (const h of (history ?? []) as { profile_id: number }[]) prior.set(h.profile_id, (prior.get(h.profile_id) ?? 0) + 1);
    for (const f of (flags ?? []) as { profile_id: number }[]) flagsBy.set(f.profile_id, (flagsBy.get(f.profile_id) ?? 0) + 1);
  }

  const today = manilaToday();
  out.rows = rows.map((r) => ({
    id: r.id,
    profileId: r.profile_id,
    name: who.get(r.profile_id)?.name ?? `Account #${r.profile_id}`,
    role: who.get(r.profile_id)?.role ?? "",
    method: r.method,
    last4: r.id_number_last4,
    issuingLgu: r.issuing_lgu,
    expiresOn: r.expires_on,
    expired: Boolean(r.expires_on && r.expires_on < today),
    status: r.status,
    submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at,
    reviewerName: r.reviewer_id ? who.get(r.reviewer_id)?.name ?? null : null,
    registryResult: r.registry_result,
    registryNote: r.registry_check_note,
    reasonLabel: r.status === "rejected" ? rejectReasonLabel(r.reason_code) : null,
    reason: r.reason,
    revokeReason: r.revoke_reason,
    hasImages: Boolean(r.front_path) && !r.images_deleted_at,
    canRevealNumber: r.status === "submitted" && Boolean(r.id_number_encrypted),
    priorCount: Math.max(0, (prior.get(r.profile_id) ?? 1) - 1),
    openFlags: flagsBy.get(r.profile_id) ?? 0,
  }));
  return out;
}

/** Sellers who may not be selling for much longer, or already cannot. */
export async function getUnverifiedSellers(): Promise<UnverifiedSellerLite[]> {
  const db = createAdminClient();
  const [{ data: sellers, error }, { data: verified }, { data: pending }] = await Promise.all([
    db.from("im_profiles").select("id, name, pwd_grace_until").eq("role", "seller").eq("account_status", "active").order("name"),
    db.from("im_verified_pwd").select("profile_id"),
    db.from("im_pwd_verifications").select("profile_id").eq("status", "submitted"),
  ]);
  if (error) return [];
  const ok = new Set(((verified ?? []) as { profile_id: number }[]).map((v) => v.profile_id));
  const waiting = new Set(((pending ?? []) as { profile_id: number }[]).map((v) => v.profile_id));
  const list = ((sellers ?? []) as { id: number; name: string; pwd_grace_until: string | null }[]).filter((s) => !ok.has(s.id));
  if (!list.length) return [];

  const { data: products } = await db
    .from("im_products")
    .select("seller_id")
    .in("seller_id", list.map((s) => s.id))
    .eq("status", "approved");
  const count = new Map<number, number>();
  for (const p of (products ?? []) as { seller_id: number }[]) count.set(p.seller_id, (count.get(p.seller_id) ?? 0) + 1);

  return list.map((s) => ({
    profileId: s.id,
    name: s.name,
    graceUntil: s.pwd_grace_until,
    listings: count.get(s.id) ?? 0,
    pending: waiting.has(s.id),
  }));
}

export async function getOpenFlags(): Promise<VerificationFlagLite[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("im_pwd_verification_flags")
    .select("id, profile_id, kind, note, created_at, existing_verification_id")
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  const rows = data as {
    id: number;
    profile_id: number;
    kind: string;
    note: string | null;
    created_at: string;
    existing_verification_id: number | null;
  }[];
  const existingIds = rows.map((r) => r.existing_verification_id).filter((n): n is number => n != null);
  const owners = new Map<number, number>();
  if (existingIds.length) {
    const { data: ex } = await db.from("im_pwd_verifications").select("id, profile_id").in("id", existingIds);
    for (const e of (ex ?? []) as { id: number; profile_id: number }[]) owners.set(e.id, e.profile_id);
  }
  const who = await names([...rows.map((r) => r.profile_id), ...owners.values()]);
  return rows.map((r) => {
    const ownerId = r.existing_verification_id ? owners.get(r.existing_verification_id) : undefined;
    return {
      id: r.id,
      profileId: r.profile_id,
      name: who.get(r.profile_id)?.name ?? `Account #${r.profile_id}`,
      kind: r.kind,
      note: r.note,
      createdAt: r.created_at,
      existingOwnerName: ownerId ? who.get(ownerId)?.name ?? `Account #${ownerId}` : null,
    };
  });
}

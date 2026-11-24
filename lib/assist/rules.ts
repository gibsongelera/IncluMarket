import type { SessionUser } from "@/lib/types";

/**
 * Rules for an admin assisting a seller (lib/actions/assist.ts): an AVRC
 * staff member works in a seller's Seller Centre for them, for example for a
 * seller who is blind. The session is the seller's, so listings, orders and
 * sales stay theirs; `session.assistedBy` names the admin.
 *
 * Pure (type imports only), so the unit tests can run it directly.
 */

/** What an action that stays the seller's own says while an admin assists. */
export const ASSIST_CLOSED =
  "This stays closed while you assist a seller, because it is theirs to do. Choose Stop assisting at the top of the page first.";

/** The audit log's limits on why an admin opened a shop. */
export const ASSIST_REASON_MIN = 10;
export const ASSIST_REASON_MAX = 300;

/**
 * The person who did something: the assisting admin when there is one.
 * Rows that record who acted (the audit log, a listing's photo history) name
 * them; rows that record whose something is (a product's seller, a message's
 * sender) keep the seller.
 */
export function actorOf(session: SessionUser): { user_id: number; role: string } {
  const a = session.assistedBy;
  return a ? { user_id: a.user_id, role: "admin" } : { user_id: session.user_id, role: session.role };
}

/**
 * An audit row's actor and target. While an admin assists, the row is the
 * admin's and its target ends "for seller:<id>", so the log reads "admin X,
 * for seller Y" (Admin → Compliance shows the seller's name there).
 */
export function auditActor(
  session: SessionUser,
  target: string | null
): { actor_id: number; actor_role: string; target: string | null } {
  const { user_id, role } = actorOf(session);
  if (!session.assistedBy) return { actor_id: user_id, actor_role: role, target };
  const forSeller = `for seller:${session.user_id}`;
  return { actor_id: user_id, actor_role: role, target: target ? `${target} ${forSeller}` : forSeller };
}

/** The reason an admin gives, on one line, or null when it is too short or long. */
export function cleanAssistReason(raw: unknown): string | null {
  const text = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (text.length < ASSIST_REASON_MIN || text.length > ASSIST_REASON_MAX) return null;
  return text;
}

const FOR_SELLER = /(?:^| )for seller:(\d+)$/;

/** "for seller:27" at the end of an audit target, as the seller's id. */
export function assistedSellerOf(target: string | null | undefined): number | null {
  const m = (target ?? "").match(FOR_SELLER);
  return m ? Number(m[1]) : null;
}

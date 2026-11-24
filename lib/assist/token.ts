import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The value of the assist cookie (lib/assist/cookie.ts): which admin is
 * working in which seller's Seller Centre, until when.
 *
 * It is signed for the admin's own sign-in (their Supabase auth user id), so
 * it does nothing in anyone else's browser session, nor after that admin
 * signs out and someone else signs in on the same computer (a shared AVRC
 * desk). Nothing in it is secret; the signature is what makes it count.
 *
 * Pure apart from node:crypto, so the unit tests can run it directly.
 */

/** How long one assist session lasts before the admin has to start again. */
export const ASSIST_SECONDS = 2 * 60 * 60;

export interface AssistGrant {
  adminId: number;
  sellerId: number;
  /** Seconds since the epoch. */
  until: number;
}

const TOKEN = /^v1\.(\d{1,15})\.(\d{1,15})\.(\d{1,12})\.([0-9a-f]{64})$/;

function mac(secret: string, authUserId: string, g: AssistGrant): string {
  return createHmac("sha256", secret)
    .update(`assist:v1:${authUserId}:${g.adminId}:${g.sellerId}:${g.until}`)
    .digest("hex");
}

export function signAssist(secret: string, authUserId: string, g: AssistGrant): string {
  return `v1.${g.adminId}.${g.sellerId}.${g.until}.${mac(secret, authUserId, g)}`;
}

/**
 * The grant in a cookie value, or null when it is malformed, signed for
 * another sign-in, expired, or further ahead than one session can last.
 */
export function readAssistToken(
  secret: string,
  authUserId: string,
  value: string | null | undefined,
  nowSeconds: number
): AssistGrant | null {
  if (!secret || !authUserId || !value) return null;
  const m = value.match(TOKEN);
  if (!m) return null;
  const g: AssistGrant = { adminId: Number(m[1]), sellerId: Number(m[2]), until: Number(m[3]) };
  if (!(g.adminId > 0) || !(g.sellerId > 0) || g.adminId === g.sellerId) return null;
  if (g.until <= nowSeconds || g.until > nowSeconds + ASSIST_SECONDS + 60) return null;
  const want = Buffer.from(mac(secret, authUserId, g));
  const got = Buffer.from(m[4]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return g;
}

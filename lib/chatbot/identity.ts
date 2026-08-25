import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import type { Role } from "@/lib/types";

/**
 * Who is talking to the chatbot, decided entirely server-side.
 *
 * The previous model took `guestId` as an ARGUMENT from the browser, read out
 * of localStorage. That made the anonymous identity forgeable: anyone could
 * pass any guest id, so the ownership check on a chat session was only as
 * strong as an attacker's willingness to try values. It also meant a stale id
 * survived sign-out, so the widget kept presenting a previous user's session
 * id on a shared device.
 *
 * The guest identity is now an httpOnly cookie the server issues and the page
 * script cannot read or set. A signed-in user is identified by their profile
 * and the cookie is ignored entirely, so signing in cannot be used to reach a
 * guest conversation or vice versa.
 */

const GUEST_COOKIE = "im_chat_guest";
const GUEST_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type ChatIdentity =
  | { kind: "user"; userId: number; role: Role; name: string; email: string }
  | { kind: "guest"; guestId: string };

/**
 * Resolve the caller. Issues a guest cookie when there is no session and none
 * exists yet.
 *
 * Must be called from a Server Action or Route Handler — setting a cookie is
 * not allowed while rendering.
 */
export async function resolveChatIdentity(): Promise<ChatIdentity> {
  const session = await getSession();
  if (session) {
    return {
      kind: "user",
      userId: session.user_id,
      role: session.role,
      name: session.name,
      email: session.email,
    };
  }

  const jar = await cookies();
  let guestId = jar.get(GUEST_COOKIE)?.value;

  // Only accept a value that looks like one we issued.
  if (!guestId || !/^g_[0-9a-f-]{36}$/.test(guestId)) {
    guestId = `g_${randomUUID()}`;
    jar.set(GUEST_COOKIE, guestId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: GUEST_MAX_AGE,
    });
  }

  return { kind: "guest", guestId };
}

/**
 * Read-only variant for render paths, which may not set cookies. Returns null
 * for a guest who has not chatted yet.
 */
export async function peekChatIdentity(): Promise<ChatIdentity | null> {
  const session = await getSession();
  if (session) {
    return {
      kind: "user",
      userId: session.user_id,
      role: session.role,
      name: session.name,
      email: session.email,
    };
  }
  const jar = await cookies();
  const guestId = jar.get(GUEST_COOKIE)?.value;
  if (!guestId || !/^g_[0-9a-f-]{36}$/.test(guestId)) return null;
  return { kind: "guest", guestId };
}

/** Stable key for rate-limit buckets. */
export function identityKey(identity: ChatIdentity): string {
  return identity.kind === "user" ? `user:${identity.userId}` : `guest:${identity.guestId}`;
}

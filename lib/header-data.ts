import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWishlistCount } from "@/lib/data";
import { getRenderSession } from "@/lib/session";
import type { Notification, Role } from "@/lib/types";

/**
 * The reads behind the site header's badges, keyed by a profile id the caller
 * has already resolved.
 *
 * These are plain server-only functions, not actions: they take an id, so
 * they must never be reachable from the browser (CLAUDE.md, "every export of
 * a 'use server' module is a public HTTP endpoint"). The bell's public
 * actions (getMyUnreadCount, getMyNotifications) and the cart actions resolve
 * the session themselves and call these.
 *
 * Why: SiteHeader used to await four public actions (the cart count, unread
 * notifications, notifications, unread messages), and each one resolved the
 * session again (a Supabase Auth round trip plus a profile read) although the
 * header already had it, in two batches one after the other. That cost about
 * 1.3 s on every signed-in page (finding 71). The cart and message counts had
 * no other caller, so those two actions are gone. getHeaderData reads everything
 * in one batch, with the session the page already resolved through
 * getRenderSession (one lookup per request, shared).
 */

/** Notifications the bell shows at most. The browser may ask for 1-50. */
const NOTIFICATION_LIMIT_MAX = 50;

export async function readCartCount(userId: number): Promise<number> {
  const { data } = await createAdminClient()
    .from("im_cart_items")
    .select("quantity")
    .eq("user_id", userId);
  return (data || []).reduce((n, r) => n + Number(r.quantity || 0), 0);
}

export async function readNotifications(userId: number, limit = 20): Promise<Notification[]> {
  const n = Math.min(NOTIFICATION_LIMIT_MAX, Math.max(1, Math.floor(Number(limit) || 20)));
  const { data } = await createAdminClient()
    .from("im_notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(n);
  return data ?? [];
}

export async function readUnreadNotificationCount(userId: number): Promise<number> {
  const { count } = await createAdminClient()
    .from("im_notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  return count ?? 0;
}

/** Unread messages in the profile's own conversations: as the buyer for a
 *  buyer, as the shop for a seller. Admins have no conversations. */
export async function readUnreadMessageCount(userId: number, role: Role): Promise<number> {
  if (role !== "buyer" && role !== "seller") return 0;
  const db = createAdminClient();
  const col = role === "buyer" ? "buyer_id" : "seller_id";
  const { data: convos } = await db.from("im_conversations").select("id").eq(col, userId);
  const ids = (convos ?? []).map((c) => c.id);
  if (!ids.length) return 0;

  const { count } = await db
    .from("im_messages")
    .select("*", { count: "exact", head: true })
    .in("conversation_id", ids)
    .neq("sender_id", userId)
    .is("read_at", null);
  return count ?? 0;
}

export interface HeaderData {
  cartCount: number;
  wishlistCount: number;
  unread: number;
  notifications: Notification[];
  unreadMessages: number;
}

/** A badge that cannot be read shows nothing rather than taking the page
 *  down: the header is on every page. Logged for the server log. */
async function orElse<T>(label: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (e) {
    console.error(`[header] ${label} could not be read:`, e);
    return fallback;
  }
}

const SIGNED_OUT: HeaderData = { cartCount: 0, wishlistCount: 0, unread: 0, notifications: [], unreadMessages: 0 };

/**
 * Everything the signed-in header shows, in one Promise.all.
 *
 * It resolves the session itself (getRenderSession, memoised per request, so
 * free when the page or layout already called it or requireRole), so no
 * caller can hand it someone else's. Every page that renders SiteHeader
 * resolves its session the same way. `variant` is the header the page asked
 * for, which can differ from the role (a seller on a product page gets the
 * buyer header), so the same rules as the actions apply: the cart counts for
 * a buyer only, and messages are read for the session's own role.
 */
export async function getHeaderData(variant: Role): Promise<HeaderData> {
  const session = await getRenderSession();
  if (!session) return SIGNED_OUT;
  const id = session.user_id;
  const buyerHeader = variant === "buyer";
  const messagesShown = variant === "buyer" || variant === "seller";

  const [cartCount, wishlistCount, unread, notifications, unreadMessages] = await Promise.all([
    buyerHeader && session.role === "buyer" ? orElse("cart count", () => readCartCount(id), 0) : 0,
    buyerHeader ? orElse("wishlist count", () => getWishlistCount(id), 0) : 0,
    orElse("unread notifications", () => readUnreadNotificationCount(id), 0),
    orElse("notifications", () => readNotifications(id), [] as Notification[]),
    messagesShown ? orElse("unread messages", () => readUnreadMessageCount(id, session.role), 0) : 0,
  ]);

  return { cartCount, wishlistCount, unread, notifications, unreadMessages };
}

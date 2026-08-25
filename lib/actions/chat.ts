"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { getChatResponder } from "@/lib/chatbot/responder";
import { buildChatContext } from "@/lib/chatbot/context";
import { identityKey, peekChatIdentity, resolveChatIdentity } from "@/lib/chatbot/identity";
import type { ChatIdentity } from "@/lib/chatbot/identity";
import { guardByIp, rateLimit } from "@/lib/security/rate-limit";

/** Hard cap on a single chat turn, before it reaches the model or the DB. */
const MAX_MESSAGE_CHARS = 1000;
/** How much of the conversation is replayed to the model. */
const HISTORY_ROWS = 16;

export interface ChatEntry {
  role: "user" | "bot" | "system";
  body: string;
}

export interface ChatActionResult {
  ok: boolean;
  error?: string;
  reply?: string;
  escalated?: boolean;
  /** Present so the widget can show who the bot thinks it is talking to. */
  audience?: "guest" | "buyer" | "seller" | "admin";
}

/**
 * Find the caller's own open chat session, or start one.
 *
 * SESSION ISOLATION: the session is looked up BY IDENTITY, never by an id the
 * client supplies. Previously the browser passed both a session id and a
 * localStorage guest id, and the server checked that they matched — which made
 * the anonymous identity forgeable, and left a stale id in localStorage after
 * sign-out on a shared device. Now there is no client-supplied identifier to
 * forge: a signed-in user resolves to their own row, a guest to the row keyed
 * by an httpOnly cookie the page script cannot read.
 */
async function findOrCreateSession(
  db: ReturnType<typeof createAdminClient>,
  identity: ChatIdentity
): Promise<number | null> {
  const base = db.from("im_chat_sessions").select("id").eq("status", "open");
  const scoped =
    identity.kind === "user"
      ? base.eq("user_id", identity.userId)
      : base.eq("guest_id", identity.guestId).is("user_id", null);

  const { data: existing } = await scoped
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  // One widened shape rather than a union, so the row type is not inferred
  // from whichever branch comes first. The table CHECK requires exactly one of
  // the two to be set.
  const payload: { user_id: number | null; guest_id: string | null } =
    identity.kind === "user"
      ? { user_id: identity.userId, guest_id: null }
      : { user_id: null, guest_id: identity.guestId };

  const { data: created } = await db
    .from("im_chat_sessions")
    .insert(payload)
    .select("id")
    .single();

  return created?.id ?? null;
}

export async function sendChatMessage(message: string): Promise<ChatActionResult> {
  const text = String(message || "").trim();
  if (!text) return { ok: false, error: "Message cannot be empty." };
  if (text.length > MAX_MESSAGE_CHARS) {
    return { ok: false, error: "That message is too long. Please shorten it." };
  }

  const identity = await resolveChatIdentity();

  // Reachable without signing in and writes two rows per call, so: per-caller,
  // per-IP, and a global daily ceiling so one visitor cannot drain the LLM
  // free-tier allocation.
  const perCaller = await rateLimit("chat_caller", identityKey(identity), {
    limit: 40,
    windowSeconds: 3600,
  });
  if (!perCaller.ok) {
    return { ok: false, error: "You have sent a lot of messages. Please wait a few minutes." };
  }
  const ipGuard = await guardByIp("chat", { limit: 60, windowSeconds: 3600 });
  if (ipGuard) return ipGuard;
  const global = await rateLimit("chat_global", "all", { limit: 2000, windowSeconds: 86400 });
  if (!global.ok) {
    return { ok: false, error: "Chat is very busy right now. Please try again later." };
  }

  const db = createAdminClient();
  const sessionId = await findOrCreateSession(db, identity);
  if (!sessionId) return { ok: false, error: "Could not start the chat. Please try again." };

  await db.from("im_chat_messages").insert({ session_id: sessionId, role: "user", body: text });

  // Only the tail of the conversation, and only from THIS session.
  const { data: priorRows } = await db
    .from("im_chat_messages")
    .select("role, body")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_ROWS);

  const history = (priorRows ?? []).reverse().map((r) => ({
    role: r.role as "user" | "bot" | "system",
    body: r.body as string,
  }));

  // Live data, scoped to this caller's role. The responder cannot reveal what
  // it was never given.
  const context = await buildChatContext(identity);

  const responder = getChatResponder();
  const { reply, escalate } = await responder.respond(history, text, context);

  await db.from("im_chat_messages").insert({ session_id: sessionId, role: "bot", body: reply });
  await db
    .from("im_chat_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId);

  return { ok: true, reply, escalated: Boolean(escalate), audience: context.audience };
}

/**
 * The caller's own transcript.
 *
 * Takes no arguments: there is no session id to pass, so there is nothing to
 * tamper with. A signed-in user gets their session, a guest gets the one keyed
 * by their cookie, and anyone else gets an empty list — not an error, because
 * a distinct "not allowed" response would confirm that a given session exists.
 */
export async function fetchChatHistory(): Promise<{
  ok: boolean;
  messages: ChatEntry[];
  audience: "guest" | "buyer" | "seller" | "admin";
}> {
  const identity = await peekChatIdentity();
  const context = await buildChatContext(identity);

  if (!identity) return { ok: true, messages: [], audience: context.audience };

  const db = createAdminClient();
  const base = db.from("im_chat_sessions").select("id").eq("status", "open");
  const scoped =
    identity.kind === "user"
      ? base.eq("user_id", identity.userId)
      : base.eq("guest_id", identity.guestId).is("user_id", null);

  const { data: session } = await scoped
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return { ok: true, messages: [], audience: context.audience };

  const { data: rows } = await db
    .from("im_chat_messages")
    .select("role, body")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });

  return {
    ok: true,
    messages: (rows ?? []).map((r) => ({
      role: r.role as "user" | "bot" | "system",
      body: r.body as string,
    })),
    audience: context.audience,
  };
}

/** Hand the caller's own conversation to the support team as a ticket. */
export async function escalateChat(): Promise<ChatActionResult> {
  const authSession = await getSession();
  if (!authSession) {
    return {
      ok: false,
      error: "Please sign in to connect with our support team, or email us from the Contact page.",
    };
  }

  const db = createAdminClient();
  const { data: chatSession } = await db
    .from("im_chat_sessions")
    .select("id")
    .eq("user_id", authSession.user_id)
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!chatSession) return { ok: false, error: "There is no open conversation to escalate." };

  const { data: rows } = await db
    .from("im_chat_messages")
    .select("role, body")
    .eq("session_id", chatSession.id)
    .order("created_at", { ascending: true });

  const transcript =
    (rows ?? [])
      .map((r) => `${r.role === "user" ? "You" : r.role === "bot" ? "Bot" : "System"}: ${r.body}`)
      .join("\n") || "(no messages yet)";

  const { data: ticket, error } = await db
    .from("im_support_tickets")
    .insert({
      user_id: authSession.user_id,
      subject: "Chatbot escalation",
      description_narrative: transcript,
      ticket_status: "open",
      priority_level: "medium",
    })
    .select("id")
    .single();
  if (error || !ticket) {
    return { ok: false, error: error?.message || "Could not escalate to support." };
  }

  await db
    .from("im_chat_sessions")
    .update({
      status: "escalated",
      escalated_ticket_id: ticket.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", chatSession.id);

  await db.from("im_audit_logs").insert({
    actor_id: authSession.user_id,
    actor_role: authSession.role,
    action: "escalated_chat",
    target: `chat_session:${chatSession.id}`,
  });

  return { ok: true, escalated: true };
}

"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { getChatResponder } from "@/lib/chatbot/responder";

export interface ChatActionResult {
  ok: boolean;
  error?: string;
  sessionId?: number;
  reply?: string;
  escalated?: boolean;
}

export async function sendChatMessage(
  sessionId: number | null,
  guestId: string | null,
  message: string
): Promise<ChatActionResult> {
  const text = message.trim();
  if (!text) return { ok: false, error: "Message cannot be empty." };

  const db = createAdminClient();
  const authSession = await getSession();

  // Only reuse an existing session if the caller actually owns it (matching
  // auth user, or matching guest_id for anonymous visitors) — otherwise a
  // client could inject messages into a stranger's session by guessing ids.
  let chatSessionId = sessionId;
  if (chatSessionId) {
    const { data } = await db
      .from("im_chat_sessions")
      .select("user_id, guest_id")
      .eq("id", chatSessionId)
      .maybeSingle();
    const owns =
      data &&
      ((authSession && data.user_id === authSession.user_id) ||
        (!authSession && guestId && data.guest_id === guestId));
    if (!owns) chatSessionId = null;
  }

  if (!chatSessionId) {
    const insertPayload: { user_id?: number; guest_id?: string } = authSession
      ? { user_id: authSession.user_id }
      : { guest_id: guestId || `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` };
    const { data: created, error } = await db
      .from("im_chat_sessions")
      .insert(insertPayload)
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: error?.message || "Could not start chat." };
    chatSessionId = created.id;
  }

  await db.from("im_chat_messages").insert({ session_id: chatSessionId, role: "user", body: text });

  const { data: priorRows } = await db
    .from("im_chat_messages")
    .select("role, body")
    .eq("session_id", chatSessionId)
    .order("created_at", { ascending: true });
  const history = (priorRows ?? []).map((r) => ({
    role: r.role as "user" | "bot" | "system",
    body: r.body as string,
  }));

  const responder = getChatResponder();
  const { reply, escalate } = await responder.respond(history, text);

  await db.from("im_chat_messages").insert({ session_id: chatSessionId, role: "bot", body: reply });
  await db.from("im_chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", chatSessionId);

  return { ok: true, sessionId: chatSessionId ?? undefined, reply, escalated: Boolean(escalate) };
}

export async function fetchChatHistory(
  sessionId: number | null,
  guestId: string | null
): Promise<{ ok: boolean; error?: string; messages?: { role: "user" | "bot" | "system"; body: string }[] }> {
  if (!sessionId) return { ok: true, messages: [] };

  const db = createAdminClient();
  const authSession = await getSession();
  const { data: sessionRow } = await db
    .from("im_chat_sessions")
    .select("user_id, guest_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sessionRow) return { ok: false, error: "Chat session not found." };

  const owns =
    (authSession && sessionRow.user_id === authSession.user_id) ||
    (!authSession && guestId && sessionRow.guest_id === guestId);
  if (!owns) return { ok: false, error: "Not allowed to read this chat." };

  const { data: rows, error } = await db
    .from("im_chat_messages")
    .select("role, body")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    messages: (rows ?? []).map((r) => ({
      role: r.role as "user" | "bot" | "system",
      body: r.body as string,
    })),
  };
}

export async function escalateChat(sessionId: number): Promise<ChatActionResult> {
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
    .select("id, user_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!chatSession) return { ok: false, error: "Chat session not found." };
  if (chatSession.user_id !== authSession.user_id)
    return { ok: false, error: "You can only escalate your own conversation." };

  const { data: rows } = await db
    .from("im_chat_messages")
    .select("role, body")
    .eq("session_id", sessionId)
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
  if (error || !ticket) return { ok: false, error: error?.message || "Could not escalate to support." };

  await db
    .from("im_chat_sessions")
    .update({ status: "escalated", escalated_ticket_id: ticket.id, updated_at: new Date().toISOString() })
    .eq("id", sessionId);

  await db.from("im_audit_logs").insert({
    actor_id: authSession.user_id,
    actor_role: authSession.role,
    action: "escalated_chat",
    target: `chat_session:${sessionId}`,
  });

  return { ok: true, sessionId, escalated: true };
}

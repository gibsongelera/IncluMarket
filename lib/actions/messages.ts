"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { createNotification } from "@/lib/actions/notifications";

export interface ActionResult {
  ok: boolean;
  error?: string;
  conversationId?: number;
}

function revalidateMessages() {
  revalidatePath("/buyer/messages");
  revalidatePath("/seller/messages");
}

export async function startConversation(
  sellerId: number,
  productId?: number
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "buyer")
    return { ok: false, error: "Sign in as a buyer to message a seller." };

  const db = createAdminClient();
  const { data: existing } = await db
    .from("im_conversations")
    .select("id")
    .eq("buyer_id", session.user_id)
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (existing) return { ok: true, conversationId: existing.id };

  const { data, error } = await db
    .from("im_conversations")
    .insert({ buyer_id: session.user_id, seller_id: sellerId, product_id: productId || null })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message || "Could not start conversation." };

  await db.from("im_audit_logs").insert({
    actor_id: session.user_id,
    actor_role: "buyer",
    action: "started_conversation",
    target: `conversation:${data.id}`,
  });

  revalidateMessages();
  return { ok: true, conversationId: data.id };
}

export async function sendMessage(conversationId: number, body: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || (session.role !== "buyer" && session.role !== "seller"))
    return { ok: false, error: "Sign in required." };
  const text = body.trim();
  if (!text) return { ok: false, error: "Message cannot be empty." };

  const db = createAdminClient();
  const { data: convo } = await db
    .from("im_conversations")
    .select("buyer_id, seller_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!convo) return { ok: false, error: "Conversation not found." };
  if (convo.buyer_id !== session.user_id && convo.seller_id !== session.user_id)
    return { ok: false, error: "You are not part of this conversation." };

  const { error } = await db.from("im_messages").insert({
    conversation_id: conversationId,
    sender_id: session.user_id,
    sender_role: session.role,
    body: text,
  });
  if (error) return { ok: false, error: error.message };

  await db
    .from("im_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  const recipientId = session.user_id === convo.buyer_id ? convo.seller_id : convo.buyer_id;
  await createNotification({
    userId: recipientId,
    type: "message",
    title: "New message",
    body: text.slice(0, 80),
    link: session.role === "buyer" ? "/seller/messages" : "/buyer/messages",
  });

  revalidateMessages();
  return { ok: true };
}

export async function markConversationRead(conversationId: number): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in required." };
  const db = createAdminClient();

  const { data: convo } = await db
    .from("im_conversations")
    .select("buyer_id, seller_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!convo) return { ok: false, error: "Conversation not found." };
  if (convo.buyer_id !== session.user_id && convo.seller_id !== session.user_id)
    return { ok: false, error: "You are not part of this conversation." };

  const { error } = await db
    .from("im_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .neq("sender_id", session.user_id)
    .is("read_at", null);
  if (error) return { ok: false, error: error.message };

  revalidateMessages();
  return { ok: true };
}

export async function getMyUnreadMessageCount(): Promise<number> {
  const session = await getSession();
  if (!session || (session.role !== "buyer" && session.role !== "seller")) return 0;
  const db = createAdminClient();

  const col = session.role === "buyer" ? "buyer_id" : "seller_id";
  const { data: convos } = await db.from("im_conversations").select("id").eq(col, session.user_id);
  const ids = (convos ?? []).map((c) => c.id);
  if (!ids.length) return 0;

  const { count } = await db
    .from("im_messages")
    .select("*", { count: "exact", head: true })
    .in("conversation_id", ids)
    .neq("sender_id", session.user_id)
    .is("read_at", null);
  return count ?? 0;
}

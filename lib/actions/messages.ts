"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { createNotification } from "@/lib/notify";
import { storePrivateImage } from "@/lib/media";
import { boundedText } from "@/lib/validation/data-url";
import { rateLimit } from "@/lib/security/rate-limit";
import { isMissingObject } from "@/lib/db-errors";

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

const MAX_BODY = 2000;
const MAX_ALT = 300;

type Sender = { user_id: number; role: "buyer" | "seller" };
type Convo = { buyer_id: number; seller_id: number };

/** The signed-in buyer or seller, and the conversation if they are in it. */
async function senderIn(
  session: Awaited<ReturnType<typeof getSession>>,
  conversationId: number
): Promise<{ ok: true; sender: Sender; convo: Convo } | { ok: false; error: string }> {
  if (!session || (session.role !== "buyer" && session.role !== "seller"))
    return { ok: false, error: "Sign in required." };
  const id = Number(conversationId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Conversation not found." };

  const { data: convo } = await createAdminClient()
    .from("im_conversations")
    .select("buyer_id, seller_id")
    .eq("id", id)
    .maybeSingle();
  if (!convo) return { ok: false, error: "Conversation not found." };
  if (convo.buyer_id !== session.user_id && convo.seller_id !== session.user_id)
    return { ok: false, error: "You are not part of this conversation." };
  return { ok: true, sender: { user_id: session.user_id, role: session.role }, convo };
}

/** Save one message, touch the conversation and tell the other person. */
async function deliver(
  conversationId: number,
  sender: Sender,
  convo: Convo,
  row: { body: string; image_path?: string; image_alt?: string | null }
): Promise<ActionResult> {
  const db = createAdminClient();
  const { error } = await db.from("im_messages").insert({
    conversation_id: conversationId,
    sender_id: sender.user_id,
    sender_role: sender.role,
    ...row,
  });
  if (error) {
    if (row.image_path && isMissingObject(error)) return { ok: false, error: PHOTOS_NEED_MIGRATION };
    console.error(`[messages] insert: ${error.message}`);
    return { ok: false, error: "Could not send the message. Please try again." };
  }

  await db
    .from("im_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  const recipientId = sender.user_id === convo.buyer_id ? convo.seller_id : convo.buyer_id;
  await createNotification({
    userId: recipientId,
    type: "message",
    title: row.image_path ? "New photo message" : "New message",
    body: row.body ? row.body.slice(0, 80) : "Sent you a photo.",
    link: sender.role === "buyer" ? "/seller/messages" : "/buyer/messages",
  });

  revalidateMessages();
  return { ok: true };
}

const PHOTOS_NEED_MIGRATION = "Photos in messages need database migration 0026. Send text for now.";

export async function sendMessage(conversationId: number, body: string): Promise<ActionResult> {
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return { ok: false, error: "Message cannot be empty." };
  if (text.length > MAX_BODY) return { ok: false, error: `Keep a message under ${MAX_BODY} characters.` };

  const who = await senderIn(await getSession(), conversationId);
  if (!who.ok) return who;
  return deliver(Number(conversationId), who.sender, who.convo, { body: text });
}

/**
 * Send a photo, with optional text and an optional description that screen
 * readers read in its place. FormData: conversationId, photo (a JPEG or PNG
 * the browser has already resized and re-encoded), body, alt.
 */
export async function sendMessagePhoto(form: FormData): Promise<ActionResult> {
  const conversationId = Number(form.get("conversationId"));
  const text = String(form.get("body") ?? "").trim();
  if (text.length > MAX_BODY) return { ok: false, error: `Keep a message under ${MAX_BODY} characters.` };
  const alt = boundedText(form.get("alt"), MAX_ALT);

  const who = await senderIn(await getSession(), conversationId);
  if (!who.ok) return who;

  const limited = await rateLimit("message_photo", `user:${who.sender.user_id}`, { limit: 30, windowSeconds: 3600 });
  if (!limited.ok) return { ok: false, error: "You have sent a lot of photos. Please wait a few minutes." };

  const stored = await storePrivateImage("message-media", conversationId, form.get("photo"));
  if (!stored.ok) return { ok: false, error: stored.missing ? PHOTOS_NEED_MIGRATION : stored.error };

  const sent = await deliver(conversationId, who.sender, who.convo, { body: text, image_path: stored.path, image_alt: alt });
  if (!sent.ok) await createAdminClient().storage.from("message-media").remove([stored.path]);
  return sent;
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

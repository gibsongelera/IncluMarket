"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { notifyAdmins } from "@/lib/notify";
import { boundedText } from "@/lib/validation/data-url";
import { isMissingObject } from "@/lib/db-errors";
import { callerFingerprint, rateLimit, RATE_LIMITED_MESSAGE } from "@/lib/security/rate-limit";
import { CONTACT_RETENTION_DAYS, CONTACT_TOPICS } from "@/lib/site";

/**
 * The public contact form (C-41). Guests can use it, so this endpoint has no
 * role check by design: it is rate-limited per caller and per email, writes
 * one row to the admin-only inbox, and never sends email to the address
 * given (that would make it a spam relay). A signed-in sender is linked to
 * their account.
 */

export interface ContactInput {
  name: string;
  email: string;
  topic: string;
  message: string;
  consent: boolean;
  /** Honeypot: people never see or fill this field. */
  website?: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function submitContactMessage(input: ContactInput): Promise<{ ok: boolean; error?: string }> {
  // A filled honeypot is a bot; it gets the same answer as a person.
  if (input?.website) return { ok: true };

  const name = boundedText(input?.name, 120);
  if (!name || name.length < 2) return { ok: false, error: "Tell us your name." };
  const email = boundedText(input?.email, 254)?.toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter an email address we can reply to, like name@gmail.com." };
  const topic = CONTACT_TOPICS.find((t) => t.id === input?.topic)?.id;
  if (!topic) return { ok: false, error: "Choose what your message is about." };
  const message = boundedText(input?.message, 4000);
  if (!message || message.length < 5) return { ok: false, error: "Write your message (a sentence is enough)." };
  if (input?.consent !== true) return { ok: false, error: "Tick the box so we may keep your message to answer it." };

  const [byCaller, byEmail] = await Promise.all([
    rateLimit("contact", await callerFingerprint(), { limit: 5, windowSeconds: 3600 }),
    rateLimit("contact", `email:${email}`, { limit: 5, windowSeconds: 86_400 }),
  ]);
  if (!byCaller.ok || !byEmail.ok) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const session = await getSession();
  const db = createAdminClient();
  const { data, error } = await db
    .from("im_contact_messages")
    .insert({ profile_id: session?.user_id ?? null, name, email, topic, message, consent: true })
    .select("id")
    .single();
  if (error || !data) {
    if (error && isMissingObject(error)) {
      return { ok: false, error: "The contact form is not switched on yet. Signed-in users can use Help in their account." };
    }
    return { ok: false, error: "Could not send your message. Please try again." };
  }

  await notifyAdmins({
    type: "system",
    title: `New contact message: ${CONTACT_TOPICS.find((t) => t.id === topic)?.label ?? topic}`,
    body: `From ${name}.`,
    link: "/admin/compliance#contact",
  });

  // Keep messages one year (Q22): an occasional sweep, at most once a day.
  const sweep = await rateLimit("contact_purge", "global", { limit: 1, windowSeconds: 86_400 });
  if (sweep.ok) {
    const cutoff = new Date(Date.now() - CONTACT_RETENTION_DAYS * 86_400_000).toISOString();
    await db.from("im_contact_messages").delete().lt("created_at", cutoff);
  }

  revalidatePath("/admin/compliance");
  return { ok: true };
}

import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderTemplate, type EmailKind, type TemplateData } from "./templates";
import { deliverViaResend, isResendConfigured } from "./resend";
import { deliverViaBrevo, isBrevoConfigured } from "./brevo";
import type { DeliveryResult } from "./types";

/**
 * Transactional email — provider selection, logging, and the no-throw contract.
 *
 * Transports live in ./resend.ts and ./brevo.ts and only know how to put one
 * rendered message on the wire. Everything shared — template rendering,
 * recipient hashing, activity logging, and the guarantee that nothing here
 * throws — lives once, in this file.
 *
 * THE HARD RULE: a failed send must never change the outcome of the action
 * that triggered it. Checkout completing matters more than the receipt
 * arriving, and an email outage must not look to a buyer like a failed order.
 * Verified against a live provider outage: sendEmail returned false, threw
 * nothing, and logged the reason.
 */

export type { EmailKind } from "./templates";

export interface Recipient {
  email: string;
  name?: string;
}

export type EmailProvider = "resend" | "brevo" | "none";

/**
 * Which transport to use.
 *
 * EMAIL_PROVIDER pins it explicitly. Otherwise whichever is configured wins,
 * Resend first — so adding a key is enough to switch, and removing one falls
 * back rather than breaking.
 */
export function activeProvider(): EmailProvider {
  const pinned = (process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  if (pinned === "resend") return "resend";
  if (pinned === "brevo") return "brevo";
  if (pinned && pinned !== "none") {
    console.warn(`[email] Unrecognised EMAIL_PROVIDER "${pinned}". Falling back to auto-detect.`);
  }
  if (isResendConfigured()) return "resend";
  if (isBrevoConfigured()) return "brevo";
  return "none";
}

/** Recipients are personal data (RA 10173); the log stores a hash, not the address. */
function hashEmail(email: string): string {
  const salt = process.env.RATE_LIMIT_SALT || "inclumarket-dev-salt";
  return createHash("sha256").update(`${salt}:${email.toLowerCase()}`).digest("hex").slice(0, 32);
}

async function logEmail(
  kind: EmailKind,
  to: string,
  status: "sent" | "failed" | "skipped",
  provider: EmailProvider,
  detail?: string
): Promise<void> {
  try {
    await createAdminClient()
      .from("im_activity_logs")
      .insert({
        actor_role: "system",
        action: `email_${status}`,
        entity_type: "email",
        entity_id: kind,
        meta: { to: hashEmail(to), provider, detail: detail?.slice(0, 300) ?? null },
      });
  } catch {
    // Logging the failure must not itself fail the caller.
  }
}

/**
 * Send one transactional email. Always resolves; never throws.
 * Returns true only when the provider accepted the message.
 */
export async function sendEmail(
  kind: EmailKind,
  to: Recipient,
  data: TemplateData
): Promise<boolean> {
  if (!to?.email) return false;

  const provider = activeProvider();
  if (provider === "none") {
    // Expected in local development — not an error.
    await logEmail(kind, to.email, "skipped", provider, "no email provider configured");
    return false;
  }

  const { subject, html, text } = renderTemplate(kind, data);
  const payload = { to, subject, html, text };

  let result: DeliveryResult;
  try {
    result = provider === "resend" ? await deliverViaResend(payload) : await deliverViaBrevo(payload);
  } catch (err) {
    // A transport should return a result rather than throw, but the caller's
    // outcome must not depend on that being true.
    result = { ok: false, error: err instanceof Error ? err.message : "unknown error" };
  }

  if (result.ok) {
    await logEmail(kind, to.email, "sent", provider);
    return true;
  }

  console.error(`[email] ${provider} send failed (${kind}): ${result.error ?? "unknown"}`);
  await logEmail(kind, to.email, "failed", provider, result.error);
  return false;
}

/**
 * Fire-and-forget send.
 *
 * Uses `after()` from next/server so the work runs once the response has been
 * flushed — the caller is never blocked on an email round trip, and Vercel
 * keeps the invocation alive for it. Falls back to a detached promise outside a
 * request scope, where Vercel may freeze the isolate first.
 */
export async function queueEmail(
  kind: EmailKind,
  to: Recipient,
  data: TemplateData
): Promise<void> {
  try {
    const { after } = await import("next/server");
    after(() => {
      void sendEmail(kind, to, data);
    });
  } catch {
    void sendEmail(kind, to, data).catch(() => {});
  }
}

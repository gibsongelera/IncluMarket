import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderTemplate, type EmailKind, type TemplateData } from "./templates";

/**
 * Transactional email via Brevo.
 *
 * HTTP API v3 rather than SMTP: a serverless function cannot usefully hold an
 * SMTP connection across invocations (no pooling, connect cost on every cold
 * start, and outbound port 587 is blocked in many runtimes). The v3 endpoint is
 * a single fetch with no dependency to add.
 *
 * THE HARD RULE: a failed send must never change the outcome of the action that
 * triggered it. Nothing in this module throws. Checkout completing is more
 * important than the receipt arriving, and a Brevo outage must not look to a
 * buyer like a failed order.
 */

const API_URL = "https://api.brevo.com/v3/smtp/email";
const TIMEOUT_MS = 5000;

export type { EmailKind } from "./templates";

export interface Recipient {
  email: string;
  name?: string;
}

/**
 * Brevo issues two kinds of credential and they are not interchangeable:
 *
 *   xkeysib-...   API key   -> the v3 REST API, which this module uses
 *   xsmtpsib-...  SMTP key  -> the SMTP relay only
 *
 * They look alike, sit next to each other in the dashboard, and an SMTP key
 * returns a bare 401 "Key not found" here — which reads like a bad key rather
 * than the wrong KIND of key. Naming it explicitly turns a confusing outage
 * into a one-line fix.
 */
function keyProblem(key: string | undefined): string | null {
  if (!key) return null;
  if (key.startsWith("xsmtpsib-")) {
    return "BREVO_API_KEY is an SMTP key (xsmtpsib-...). The v3 API needs an API key (xkeysib-...), created under SMTP & API -> API Keys.";
  }
  if (!key.startsWith("xkeysib-")) {
    return `BREVO_API_KEY has an unexpected prefix. Expected xkeysib-..., got ${key.slice(0, 9)}...`;
  }
  return null;
}

function isConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
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
        meta: { to: hashEmail(to), detail: detail?.slice(0, 300) ?? null },
      });
  } catch {
    // Logging the failure must not itself fail the caller.
  }
}

/**
 * Send one transactional email. Always resolves; never throws.
 * Returns true only when Brevo accepted the message.
 */
export async function sendEmail(
  kind: EmailKind,
  to: Recipient,
  data: TemplateData
): Promise<boolean> {
  if (!to?.email) return false;

  if (!isConfigured()) {
    // Expected in local development — do not treat as an error.
    await logEmail(kind, to.email, "skipped", "BREVO_API_KEY or sender not set");
    return false;
  }

  const problem = keyProblem(process.env.BREVO_API_KEY);
  if (problem) {
    // Say what is wrong once, at the point of use, instead of letting every
    // send fail with an opaque 401.
    console.error(`[brevo] ${problem}`);
    await logEmail(kind, to.email, "failed", problem);
    return false;
  }

  const { subject, html, text } = renderTemplate(kind, data);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY as string,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: {
          email: process.env.BREVO_SENDER_EMAIL,
          name: process.env.BREVO_SENDER_NAME || "IncluMarket",
        },
        to: [{ email: to.email, ...(to.name ? { name: to.name } : {}) }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      await logEmail(kind, to.email, "failed", `HTTP ${res.status} ${detail.slice(0, 200)}`);
      return false;
    }

    await logEmail(kind, to.email, "sent");
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    await logEmail(kind, to.email, "failed", message);
    return false;
  }
}

/**
 * Fire-and-forget send.
 *
 * Uses `after()` from next/server so the work runs once the response has been
 * flushed — the caller is never blocked on an email round trip, and Vercel
 * keeps the invocation alive for it. Falls back to a detached promise if
 * `after()` is unavailable (e.g. outside a request scope, as in a script).
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

import "server-only";
import type { DeliveryPayload, DeliveryResult } from "./types";

/**
 * Brevo transport.
 *
 * Kept as an alternative to Resend rather than deleted: the code works, and
 * the account-level block that pushed this project to Resend is Brevo account
 * state that may well clear.
 *
 * HTTP API v3 rather than SMTP: a serverless function cannot usefully hold an
 * SMTP connection across invocations, and outbound port 587 is blocked in many
 * runtimes.
 *
 * Select it with EMAIL_PROVIDER=brevo. Orchestration, logging and the no-throw
 * contract live in ./send.ts.
 */

const API_URL = "https://api.brevo.com/v3/smtp/email";
const TIMEOUT_MS = 8000;

export function isBrevoConfigured(): boolean {
  return Boolean(
    process.env.BREVO_API_KEY && (process.env.EMAIL_FROM || process.env.BREVO_SENDER_EMAIL)
  );
}

/**
 * Brevo issues two kinds of credential and they are not interchangeable:
 *
 *   xkeysib-...   API key   -> the v3 REST API, which this module uses
 *   xsmtpsib-...  SMTP key  -> the SMTP relay only
 *
 * They look alike, sit next to each other in the dashboard, and an SMTP key
 * returns a bare 401 "Key not found" here — which reads like a bad key rather
 * than the wrong KIND of key.
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

export async function deliverViaBrevo(payload: DeliveryPayload): Promise<DeliveryResult> {
  const key = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM || process.env.BREVO_SENDER_EMAIL;

  if (!key || !from) return { ok: false, error: "BREVO_API_KEY or sender is not set" };

  const problem = keyProblem(key);
  if (problem) return { ok: false, error: problem };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "api-key": key,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: {
          email: from,
          name: process.env.EMAIL_FROM_NAME || process.env.BREVO_SENDER_NAME || "IncluMarket",
        },
        to: [{ email: payload.to.email, ...(payload.to.name ? { name: payload.to.name } : {}) }],
        subject: payload.subject,
        htmlContent: payload.html,
        textContent: payload.text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { messageId?: string } | null;
      return { ok: true, id: body?.messageId };
    }

    const detail = await res.text().catch(() => "");

    // Brevo 401s both for a bad key and for account-level IP protection, and
    // the fixes have nothing in common.
    if (res.status === 401 && /unrecognised ip|unrecognized ip|authorised_ip/i.test(detail)) {
      return {
        ok: false,
        error:
          "Brevo is blocking this IP at the account level. Serverless egress IPs are dynamic and cannot be allow-listed, so this affects production too. Use EMAIL_PROVIDER=resend, or resolve it with Brevo support.",
      };
    }

    return { ok: false, error: `HTTP ${res.status} ${detail.slice(0, 160)}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown error" };
  }
}

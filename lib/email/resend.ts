import "server-only";
import type { DeliveryPayload, DeliveryResult } from "./types";

/**
 * Resend transport.
 *
 * Plain fetch against https://api.resend.com/emails — no SDK, matching the
 * rest of this codebase and keeping the dependency list short.
 *
 * Chosen over Brevo after Brevo's account-level new-IP protection blocked API
 * calls with a 401 that the Authorized-IPs toggle could not clear. Resend does
 * not gate free accounts by IP, which matters here specifically because Vercel
 * egress IPs are dynamic and can never be allow-listed.
 *
 * SENDER RULES, which bite immediately on a free account:
 *   - With a verified domain you may send to anyone from any address at it.
 *   - WITHOUT a domain you may only send FROM `onboarding@resend.dev`, and only
 *     TO the email address the Resend account was registered with.
 * The second case is fine for a demo and useless in production, so the failure
 * is named explicitly rather than surfaced as a bare 403.
 */

const API_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 8000;

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function deliverViaResend(payload: DeliveryPayload): Promise<DeliveryResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!key || !from) {
    return { ok: false, error: "RESEND_API_KEY or EMAIL_FROM is not set" };
  }

  const fromHeader = process.env.EMAIL_FROM_NAME
    ? `${process.env.EMAIL_FROM_NAME} <${from}>`
    : from;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromHeader,
        to: [payload.to.email],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { id?: string } | null;
      return { ok: true, id: body?.id };
    }

    const detail = await res.text().catch(() => "");

    // 403 on a domain-less account is the single most likely first failure, and
    // the raw message does not make the cause obvious.
    if (res.status === 403 && /domain|verify/i.test(detail)) {
      return {
        ok: false,
        error:
          `Resend rejected the sender "${from}". Without a verified domain you can only send ` +
          `FROM onboarding@resend.dev, and only TO your own Resend account address. ` +
          `Verify a domain, or set EMAIL_FROM=onboarding@resend.dev for local testing. (${detail.slice(0, 120)})`,
      };
    }

    return { ok: false, error: `HTTP ${res.status} ${detail.slice(0, 160)}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, error: message };
  }
}

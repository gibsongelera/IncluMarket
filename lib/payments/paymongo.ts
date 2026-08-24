import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * PayMongo integration — Checkout Sessions.
 *
 * Why Checkout Sessions rather than Payment Intents: Payment Intents require us
 * to build the method-selection UI, call /payment_methods, attach, then handle
 * each e-wallet's next_action.redirect.url ourselves and re-implement 3-D
 * Secure for cards. A Checkout Session is one POST that returns a hosted page
 * PayMongo maintains, already covering GCash / Maya / GrabPay / card selection
 * and 3DS. Card data never touches this application, so there is no PCI surface
 * here, and no hand-rolled payment UI to audit for accessibility.
 *
 * Everything in this module is server-only; PAYMONGO_SECRET_KEY must never be
 * exposed to the browser.
 */

const API_BASE = "https://api.paymongo.com/v1";

export interface CheckoutLine {
  name: string;
  /** Integer centavos. Use toCentavos(). */
  amountCentavos: number;
  quantity: number;
  description?: string;
}

export interface CreateCheckoutArgs {
  orderId: number;
  lines: CheckoutLine[];
  shippingCentavos: number;
  billing: { name: string; email: string; phone: string };
  successUrl: string;
  cancelUrl: string;
}

export type CheckoutResult =
  | { ok: true; checkoutUrl: string; sessionId: string }
  | { ok: false; error: string };

/**
 * Convert a peso amount to integer centavos.
 *
 * im_orders.total_amount is numeric(12,2) and arrives as a JS number, so this
 * rounds rather than truncating — `parseInt(19.99 * 100)` is 1998, not 1999,
 * and a one-centavo drift on every order is a real accounting problem.
 */
export function toCentavos(pesos: number): number {
  return Math.round(Number(pesos) * 100);
}

export function isPayMongoConfigured(): boolean {
  return Boolean(process.env.PAYMONGO_SECRET_KEY);
}

function authHeader(): string {
  const key = process.env.PAYMONGO_SECRET_KEY ?? "";
  // PayMongo uses HTTP Basic with the secret key as the username and no password.
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

/** Payment methods offered on the hosted page. */
const PAYMENT_METHOD_TYPES = ["gcash", "paymaya", "grab_pay", "card"];

export async function createCheckoutSession(
  args: CreateCheckoutArgs
): Promise<CheckoutResult> {
  if (!isPayMongoConfigured()) {
    return { ok: false, error: "Online payment is not configured." };
  }

  const lineItems = args.lines.map((l) => ({
    name: l.name.slice(0, 120),
    amount: l.amountCentavos,
    quantity: l.quantity,
    currency: "PHP",
    ...(l.description ? { description: l.description.slice(0, 200) } : {}),
  }));

  if (args.shippingCentavos > 0) {
    lineItems.push({
      name: "Shipping",
      amount: args.shippingCentavos,
      quantity: 1,
      currency: "PHP",
    });
  }

  const body = {
    data: {
      attributes: {
        line_items: lineItems,
        payment_method_types: PAYMENT_METHOD_TYPES,
        // reference_number and metadata both carry the order id so the webhook
        // can resolve the order without trusting anything in the return URL.
        reference_number: String(args.orderId),
        metadata: { order_id: String(args.orderId) },
        billing: {
          name: args.billing.name.slice(0, 120),
          email: args.billing.email,
          phone: args.billing.phone.slice(0, 32),
        },
        success_url: args.successUrl,
        cancel_url: args.cancelUrl,
        description: `IncluMarket order #${args.orderId}`,
        send_email_receipt: false,
        show_line_items: true,
      },
    },
  };

  try {
    const res = await fetch(`${API_BASE}/checkout_sessions`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const json = (await res.json()) as {
      data?: { id?: string; attributes?: { checkout_url?: string } };
      errors?: { detail?: string }[];
    };

    if (!res.ok) {
      // Never surface the raw provider error to the buyer; log it instead.
      const detail = json.errors?.[0]?.detail || `HTTP ${res.status}`;
      console.error("[paymongo] checkout session failed:", detail);
      return { ok: false, error: "Could not start the payment. Please try again." };
    }

    const sessionId = json.data?.id;
    const checkoutUrl = json.data?.attributes?.checkout_url;
    if (!sessionId || !checkoutUrl) {
      console.error("[paymongo] checkout session response missing id/url");
      return { ok: false, error: "Could not start the payment. Please try again." };
    }

    return { ok: true, checkoutUrl, sessionId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[paymongo] checkout session error:", message);
    return { ok: false, error: "Could not reach the payment provider. Please try again." };
  }
}

/**
 * Verify a webhook signature.
 *
 * The Paymongo-Signature header looks like:  t=<unix>,te=<hex>,li=<hex>
 * where `te` is the test-mode signature and `li` the live-mode one. The signed
 * payload is `${t}.${rawBody}` — so the handler must read the body as text and
 * must NOT re-serialize parsed JSON, or the HMAC will never match.
 */
export function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  mode: "test" | "live" = "test",
  toleranceSeconds = 300
): { ok: boolean; reason?: string } {
  if (!secret) return { ok: false, reason: "PAYMONGO_WEBHOOK_SECRET is not set" };
  if (!header) return { ok: false, reason: "missing signature header" };

  const parts = new Map<string, string>();
  for (const segment of header.split(",")) {
    const [k, v] = segment.split("=");
    if (k && v) parts.set(k.trim(), v.trim());
  }

  const timestamp = parts.get("t");
  const provided = parts.get(mode === "live" ? "li" : "te");
  if (!timestamp || !provided) return { ok: false, reason: "malformed signature header" };

  // Reject replays of an old, validly-signed delivery.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) {
    return { ok: false, reason: "signature timestamp outside tolerance" };
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return { ok: false, reason: "signature length mismatch" };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: "signature mismatch" };

  return { ok: true };
}

export function payMongoMode(): "test" | "live" {
  return process.env.PAYMONGO_ENV === "live" ? "live" : "test";
}

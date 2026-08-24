import { NextResponse } from "next/server";
import { applyPaymentResult } from "@/lib/payments/apply";
import { payMongoMode, verifyWebhookSignature } from "@/lib/payments/paymongo";

/**
 * PayMongo webhook receiver.
 *
 * This is the second Route Handler in the codebase (after the auth callback),
 * and the exception is deliberate — docs/REBUILD_PLAN.md otherwise mandates
 * server actions. A webhook cannot be an action:
 *
 *   1. PayMongo POSTs from its own infrastructure. It cannot speak Next.js's
 *      encrypted action-id protocol, and the action layer's Origin/Host CSRF
 *      check would reject it.
 *   2. Signature verification needs the RAW request body. Parsing to JSON and
 *      re-serializing changes the bytes and the HMAC never matches.
 *   3. The provider decides whether to retry based on the HTTP status code,
 *      which only a Route Handler controls.
 *
 * Register it at:  <NEXT_PUBLIC_SITE_URL>/api/webhooks/paymongo
 * Events:          checkout_session.payment.paid, payment.paid, payment.failed
 */

// node:crypto timingSafeEqual is required by the signature check.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PayMongoEvent {
  data?: {
    id?: string;
    attributes?: {
      type?: string;
      data?: {
        id?: string;
        attributes?: {
          reference_number?: string;
          metadata?: Record<string, string>;
          payments?: { id?: string }[];
        };
      };
    };
  };
}

function resolveOrderId(event: PayMongoEvent): number | null {
  const attrs = event.data?.attributes?.data?.attributes;
  const raw = attrs?.metadata?.order_id ?? attrs?.reference_number;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: Request) {
  // Must be read as text, before anything parses it.
  const rawBody = await request.text();

  const verdict = verifyWebhookSignature(
    rawBody,
    request.headers.get("paymongo-signature"),
    process.env.PAYMONGO_WEBHOOK_SECRET,
    payMongoMode()
  );

  if (!verdict.ok) {
    console.error("[paymongo webhook] rejected:", verdict.reason);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: PayMongoEvent;
  try {
    event = JSON.parse(rawBody) as PayMongoEvent;
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const eventId = event.data?.id;
  const eventType = event.data?.attributes?.type ?? "";

  if (!eventId) {
    return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  }

  // Everything below returns 200 even when it is a no-op. A non-2xx tells
  // PayMongo to retry, and retrying will not fix an event we do not handle or
  // an order we cannot resolve — it would just retry forever.
  const isPaid = eventType === "checkout_session.payment.paid" || eventType === "payment.paid";
  const isFailed = eventType === "payment.failed";

  if (!isPaid && !isFailed) {
    console.info("[paymongo webhook] ignoring event type:", eventType);
    return NextResponse.json({ received: true, handled: false });
  }

  const orderId = resolveOrderId(event);
  if (!orderId) {
    console.error("[paymongo webhook] could not resolve order id for event", eventId);
    return NextResponse.json({ received: true, handled: false });
  }

  const inner = event.data?.attributes?.data;
  const reference = inner?.attributes?.payments?.[0]?.id ?? inner?.id ?? eventId;

  const result = await applyPaymentResult({
    orderId,
    outcome: isPaid ? "paid" : "failed",
    reference,
    eventId,
    providerId: "paymongo",
  });

  if (!result.ok) {
    // A genuine server-side failure — let PayMongo retry this one.
    console.error("[paymongo webhook] apply failed:", result.error);
    return NextResponse.json({ error: "Could not apply payment" }, { status: 500 });
  }

  return NextResponse.json({ received: true, handled: true, status: result.status });
}

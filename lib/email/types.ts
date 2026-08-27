import "server-only";

/** One rendered message, ready for whichever transport is configured. */
export interface DeliveryPayload {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
}

/** Transports never throw — a failed send must not change a caller's outcome. */
export interface DeliveryResult {
  ok: boolean;
  /** Provider message id, when the transport returns one. */
  id?: string;
  /** Human-readable reason, logged but never shown to a user. */
  error?: string;
}

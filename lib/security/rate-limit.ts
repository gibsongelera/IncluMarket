import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fixed-window rate limiting, backed by Postgres (see migration 0009).
 *
 * Why not an in-memory Map: this deploys to Vercel, where each serverless
 * invocation may land in a different isolate with its own heap. A process-local
 * counter resets on every cold start, is not shared between concurrent
 * instances, and is therefore bypassed simply by issuing requests in parallel.
 * The `im_rate_limit_hit` RPC does the check-and-increment atomically in a
 * single round trip on the connection the action already has.
 *
 * Fail-open is deliberate: if the limiter itself errors, users still get to log
 * in and check out. A broken limiter must not become an outage.
 */

export interface RateLimitOptions {
  /** Max hits permitted inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  ok: boolean;
}

/**
 * Stable, non-reversible identifier for the caller.
 *
 * Raw IP addresses are personal data under RA 10173, and this table is read by
 * anyone with service-role access, so the address is hashed with a server-side
 * salt before it is ever stored. Set RATE_LIMIT_SALT in the environment; the
 * fallback keeps development working but offers no protection against a
 * rainbow-table attack on the (small) IPv4 space.
 */
export async function callerFingerprint(prefix = "ip"): Promise<string> {
  let ip = "unknown";
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    // First hop is the client; the rest are proxies we control.
    ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  } catch {
    // headers() is unavailable outside a request scope — fall through.
  }
  const salt = process.env.RATE_LIMIT_SALT || "inclumarket-dev-salt";
  const digest = createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
  return `${prefix}:${digest}`;
}

/**
 * Record a hit and report whether the caller is still under the limit.
 *
 * @param bucket     Logical endpoint name, e.g. "login" or "chat".
 * @param identifier Who is being limited — use callerFingerprint(), or a
 *                   stable per-subject key such as `email:<address>`.
 */
export async function rateLimit(
  bucket: string,
  identifier: string,
  opts: RateLimitOptions
): Promise<RateLimitResult> {
  try {
    const db = createAdminClient();
    const { data, error } = await db.rpc("im_rate_limit_hit", {
      p_bucket: bucket,
      p_identifier: identifier,
      p_window_seconds: opts.windowSeconds,
      p_max_hits: opts.limit,
    });
    if (error) return { ok: true };
    return { ok: data !== false };
  } catch {
    return { ok: true };
  }
}

/** Standard user-facing message. Never leaks the counter or the window. */
export const RATE_LIMITED_MESSAGE =
  "Too many attempts. Please wait a few minutes and try again.";

/**
 * Convenience wrapper: limit by hashed IP for the given bucket.
 * Returns null when the caller may proceed, or an error result when limited.
 */
export async function guardByIp(
  bucket: string,
  opts: RateLimitOptions
): Promise<{ ok: false; error: string } | null> {
  const id = await callerFingerprint();
  const { ok } = await rateLimit(bucket, id, opts);
  return ok ? null : { ok: false, error: RATE_LIMITED_MESSAGE };
}

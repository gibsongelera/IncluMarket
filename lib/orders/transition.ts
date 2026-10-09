import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { canTransition, transitionMessage, type Actor, type OrderState } from "./state";

type Db = ReturnType<typeof createAdminClient>;

export interface TransitionArgs {
  orderId: number;
  to: OrderState;
  actorId: number | null;
  actorRole: Actor;
  note?: string | null;
  /** courier, tracking_number (shipping); reason (cancel/return). */
  meta?: Record<string, string | null | undefined>;
}

export interface TransitionResult {
  ok: boolean;
  code: string;
  error?: string;
}

function isMissingFunction(e: { code?: string; message?: string }): boolean {
  return e.code === "PGRST202" || e.code === "42883" || /could not find the function/i.test(e.message || "");
}

/**
 * Change an order's status — the ONLY way application code does it.
 *
 * With migration 0014 applied this is a single call to im_transition_order(),
 * which checks the move, records timestamps, restocks on cancellation and
 * writes the history row in one transaction; a trigger refuses any other kind
 * of status update. While 0014 is not applied yet (code deployed first) it
 * falls back to the same rules checked here, for the five original statuses.
 */
export async function transitionOrder(db: Db, args: TransitionArgs): Promise<TransitionResult> {
  const meta = Object.fromEntries(
    Object.entries(args.meta ?? {}).filter(([, v]) => v != null && String(v).trim() !== "")
  );
  const { data, error } = await db.rpc("im_transition_order", {
    p_order_id: args.orderId,
    p_to: args.to,
    p_actor_id: args.actorId,
    p_actor_role: args.actorRole,
    p_note: args.note ?? null,
    p_meta: meta,
  });
  if (!error) {
    const code = String(data);
    return code === "ok" ? { ok: true, code } : { ok: false, code, error: transitionMessage(code, args.to) };
  }
  if (isMissingFunction(error)) return legacyTransition(db, args);
  console.error("[orders] transition failed:", error.message);
  return { ok: false, code: "error", error: transitionMessage("error") };
}

const LEGACY_STATES = new Set(["pending", "processing", "shipped", "delivered", "returned"]);

async function legacyTransition(db: Db, args: TransitionArgs): Promise<TransitionResult> {
  if (!LEGACY_STATES.has(args.to)) {
    return { ok: false, code: "unavailable", error: "This step needs the latest database update. Please try again later." };
  }
  const { data: order } = await db
    .from("im_orders")
    .select("id, order_status, payment_status, payment_provider")
    .eq("id", args.orderId)
    .maybeSingle();
  if (!order) return { ok: false, code: "not_found", error: transitionMessage("not_found") };
  // Pre-0014 there is no return_requested step, so a seller-initiated
  // delivered → returned is allowed here exactly as before.
  const legacyReturn = order.order_status === "delivered" && args.to === "returned" && args.actorRole !== "buyer";
  if (!legacyReturn && !canTransition(order, args.to, args.actorRole)) {
    return { ok: false, code: "illegal", error: transitionMessage("illegal", args.to) };
  }
  const { data: moved } = await db
    .from("im_orders")
    .update({ order_status: args.to })
    .eq("id", args.orderId)
    .eq("order_status", order.order_status)
    .select("id")
    .maybeSingle();
  if (!moved) return { ok: false, code: "conflict", error: "This order was just updated. Please refresh." };
  await db.from("im_order_status_history").insert({
    order_id: args.orderId,
    status: args.to,
    note: args.note ?? args.meta?.reason ?? null,
    created_by: args.actorId,
  });
  return { ok: true, code: "ok" };
}

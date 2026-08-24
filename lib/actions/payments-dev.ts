"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { applyPaymentResult } from "@/lib/payments/apply";

/**
 * Development-only payment simulation.
 *
 * PayMongo webhooks cannot reach localhost, so without a tunnel there is no way
 * to see an order transition to paid. This calls the SAME applyPaymentResult()
 * the real webhook calls — a simulator that took a different code path would
 * prove nothing about the real one.
 *
 * Three independent conditions must hold, because this is an action and every
 * action export is a public HTTP endpoint:
 *   1. NODE_ENV is not production
 *   2. ENABLE_PAYMENT_SIMULATION === "1"
 *   3. the caller is an admin
 *
 * Leave ENABLE_PAYMENT_SIMULATION unset in Vercel.
 */

export interface SimulateResult {
  ok: boolean;
  error?: string;
  status?: string;
}

export async function isPaymentSimulationEnabled(): Promise<boolean> {
  return (
    process.env.NODE_ENV !== "production" && process.env.ENABLE_PAYMENT_SIMULATION === "1"
  );
}

export async function simulatePaymentAction(
  orderId: number,
  outcome: "paid" | "failed"
): Promise<SimulateResult> {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, error: "Not available." };
  }
  if (process.env.ENABLE_PAYMENT_SIMULATION !== "1") {
    return { ok: false, error: "Payment simulation is disabled." };
  }

  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { ok: false, error: "Admin access required." };
  }

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { ok: false, error: "Invalid order id." };
  }

  const result = await applyPaymentResult({
    orderId,
    outcome,
    reference: `sim_${outcome}_${orderId}`,
    // Deterministic per order+outcome so re-running it exercises the real
    // idempotency gate rather than silently double-applying.
    eventId: `sim_evt_${orderId}_${outcome}`,
    providerId: "paymongo",
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/payments");
  revalidatePath("/buyer/orders");
  return { ok: true, status: result.status };
}

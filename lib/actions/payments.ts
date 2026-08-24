"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";

export type PaymentProviderRow = {
  id: string;
  display_name: string;
  enabled: boolean;
  is_configured: boolean;
  dashboard_url: string | null;
  public_key: string | null;
};

// Admin-only: returns configuration state, including the stored public key and
// the dashboard URL. This was an unauthenticated export, i.e. a public endpoint
// leaking provider config for every provider including disabled ones.
export async function listPaymentProviders(): Promise<PaymentProviderRow[]> {
  const session = await getSession();
  if (!session || session.role !== "admin") return [];
  const db = createAdminClient();
  const { data } = await db
    .from("im_payment_providers")
    .select("id, display_name, enabled, is_configured, dashboard_url, public_key")
    .order("id");
  return (data ?? []) as PaymentProviderRow[];
}

export async function updatePaymentProvider(input: {
  id: string;
  enabled: boolean;
  publicKey?: string;
  markConfigured?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "Admin only." };

  const db = createAdminClient();
  const patch: Record<string, unknown> = {
    enabled: input.enabled,
    updated_by: session.user_id,
    updated_at: new Date().toISOString(),
  };
  if (typeof input.publicKey === "string") patch.public_key = input.publicKey || null;
  if (input.markConfigured) {
    patch.is_configured = true;
    patch.secret_key_hint = "•••• configured";
  }

  const { error } = await db.from("im_payment_providers").update(patch).eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  await db.from("im_activity_logs").insert({
    actor_id: session.user_id,
    actor_role: "admin",
    action: "updated_payment_provider",
    entity_type: "payment_provider",
    entity_id: input.id,
    meta: { enabled: input.enabled },
  });

  revalidatePath("/admin/payments");
  revalidatePath("/buyer/checkout");
  return { ok: true };
}

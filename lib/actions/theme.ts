"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

export async function saveThemeChrome(
  colorNav: string,
  colorBody: string,
  colorFooter: string
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const hex = /^#[0-9A-Fa-f]{6}$/;
  if (![colorNav, colorBody, colorFooter].every((c) => hex.test(c)))
    return { ok: false, error: "All chrome colors must be valid hex values." };

  const db = createAdminClient();
  await db
    .from("im_theme_settings")
    .update({
      color_nav: colorNav.toUpperCase(),
      color_body: colorBody.toUpperCase(),
      color_footer: colorFooter.toUpperCase(),
      updated_by: admin.user_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  await db.from("im_audit_logs").insert({
    actor_id: admin.user_id,
    actor_role: "admin",
    action: "updated_theme_chrome",
    target: "ui:theme",
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function applyThemePreset(presetId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const db = createAdminClient();
  await db
    .from("im_theme_settings")
    .update({
      theme_preset: presetId,
      color_nav: null,
      color_body: null,
      color_footer: null,
      color_nav_text: null,
      color_footer_text: null,
      updated_by: admin.user_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  await db.from("im_audit_logs").insert({
    actor_id: admin.user_id,
    actor_role: "admin",
    action: "applied_theme_preset",
    target: `theme:${presetId}`,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

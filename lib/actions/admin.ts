"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import {
  buildReportWorkbook,
  type ReportType,
} from "@/lib/reports/excel";
import type { ProductStatus, TicketStatus } from "@/lib/types";

export type { ReportType };

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

async function audit(actorId: number, action: string, target: string) {
  await createAdminClient()
    .from("im_audit_logs")
    .insert({ actor_id: actorId, actor_role: "admin", action, target });
}

export async function setProductStatus(
  productId: number,
  status: ProductStatus
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const db = createAdminClient();
  const { error } = await db
    .from("im_products")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) return { ok: false, error: error.message };
  const verb = status === "approved" ? "approved_product" : status === "flagged" ? "flagged_product" : "reset_product";
  await audit(admin.user_id, verb, `product:${productId}`);
  revalidatePath("/admin/products");
  return { ok: true };
}

export async function setProductFeatured(
  productId: number,
  featured: boolean
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const db = createAdminClient();
  const { error } = await db
    .from("im_products")
    .update({ is_featured: featured, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) return { ok: false, error: error.message };
  await audit(admin.user_id, featured ? "featured_product" : "unfeatured_product", `product:${productId}`);
  revalidatePath("/admin/products");
  revalidatePath("/home");
  revalidatePath("/buyer/product", "layout");
  return { ok: true };
}

export async function setSellerFeatured(
  userId: number,
  featured: boolean,
  story?: string
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const db = createAdminClient();
  const { data: target } = await db.from("im_profiles").select("role").eq("id", userId).maybeSingle();
  if (!target || target.role !== "seller") return { ok: false, error: "Only sellers can be featured." };

  const patch: Record<string, unknown> = { is_featured_seller: featured, updated_at: new Date().toISOString() };
  if (story !== undefined) patch.seller_story = story.trim() || null;

  const { error } = await db.from("im_profiles").update(patch).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  await audit(admin.user_id, featured ? "featured_seller" : "unfeatured_seller", `profile:${userId}`);
  revalidatePath("/admin/users");
  revalidatePath("/home");
  return { ok: true };
}

export async function assignTicket(ticketId: number): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const db = createAdminClient();
  const { error } = await db
    .from("im_support_tickets")
    .update({
      assigned_to: admin.user_id,
      ticket_status: "in_progress",
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);
  if (error) return { ok: false, error: error.message };
  await audit(admin.user_id, "assigned_ticket", `ticket:${ticketId}`);
  revalidatePath("/admin/tickets");
  return { ok: true };
}

export async function setTicketStatus(
  ticketId: number,
  status: TicketStatus
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const db = createAdminClient();
  const { error } = await db
    .from("im_support_tickets")
    .update({ ticket_status: status, updated_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) return { ok: false, error: error.message };
  await audit(admin.user_id, status === "resolved" ? "resolved_ticket" : "updated_ticket", `ticket:${ticketId}`);
  revalidatePath("/admin/tickets");
  return { ok: true };
}

export async function addAdminTicketResponse(
  ticketId: number,
  message: string
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const clean = String(message || "").trim();
  if (!clean) return { ok: false, error: "Message cannot be empty." };
  const db = createAdminClient();
  const { error } = await db.from("im_ticket_responses").insert({
    ticket_id: ticketId,
    author_role: "admin",
    author_id: admin.user_id,
    message: clean,
  });
  if (error) return { ok: false, error: error.message };
  await db
    .from("im_support_tickets")
    .update({ ticket_status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", ticketId);
  await audit(admin.user_id, "replied_ticket", `ticket:${ticketId}`);
  revalidatePath("/admin/tickets");
  return { ok: true };
}

export async function updateUserRole(
  userId: number,
  role: "buyer" | "seller" | "admin"
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  if (userId === admin.user_id && role !== "admin")
    return { ok: false, error: "You cannot demote your own admin account." };
  const db = createAdminClient();
  const { error } = await db
    .from("im_profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  await audit(admin.user_id, `changed_role_to_${role}`, `user:${userId}`);
  revalidatePath("/admin/users");
  return { ok: true };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface UserInput {
  name: string;
  email: string;
  role: "buyer" | "seller" | "admin";
  disability_type?: string | null;
  assistive_needs?: string | null;
}

export async function createUser(input: UserInput, consent: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  if (!name || name.length < 2) return { ok: false, error: "Full name is required." };
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email address." };
  if (!["buyer", "seller", "admin"].includes(input.role))
    return { ok: false, error: "Please pick a valid role." };
  if (!consent)
    return { ok: false, error: "Consent confirmation is required to create a user (RA 10173)." };

  const db = createAdminClient();
  const { data: existing } = await db.from("im_profiles").select("id").ilike("email", email).maybeSingle();
  if (existing) return { ok: false, error: "Another user already uses that email." };

  // Create the AUTH user first, and let the on_auth_user_created trigger create
  // the matching profile.
  //
  // This used to insert a bare im_profiles row with no auth_user_id. Combined
  // with the signup trigger's old `on conflict (email) do update set
  // auth_user_id = excluded.auth_user_id`, that was a profile-takeover primitive:
  // an admin pre-creating an admin profile for an address meant whoever signed
  // up with that address inherited it. Migration 0009 closed the trigger side;
  // this closes the other half by never producing an unlinked profile at all.
  //
  // An invite (rather than a password we choose) means no admin ever handles
  // another person's credentials.
  const { data: invited, error: inviteErr } = await db.auth.admin.inviteUserByEmail(email, {
    data: { name },
  });
  if (inviteErr || !invited?.user) {
    return {
      ok: false,
      error:
        inviteErr?.message ||
        "Could not send the invitation. Check that email delivery is configured for this project.",
    };
  }

  // The trigger only ever mints 'buyer' or 'seller' from metadata, so the
  // intended role is applied here, through the service-role client, after the
  // admin check above.
  const { data: created, error } = await db
    .from("im_profiles")
    .update({
      name,
      role: input.role,
      disability_type: input.disability_type || null,
      assistive_needs: input.assistive_needs || null,
      updated_at: new Date().toISOString(),
    })
    .eq("auth_user_id", invited.user.id)
    .select("*")
    .single();
  if (error || !created) return { ok: false, error: error?.message || "Could not create user." };

  await db.from("im_consent_logs").insert({
    user_id: created.id,
    action: "account_created_by_admin",
    consent: true,
    purpose: "RA 10173 DPA registration consent (admin-recorded)",
  });
  await audit(admin.user_id, `created_user_${input.role}`, `user:${created.id}`);
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateUser(userId: number, input: UserInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  if (!name || name.length < 2) return { ok: false, error: "Full name is required." };
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email address." };

  const db = createAdminClient();
  const { data: clash } = await db
    .from("im_profiles")
    .select("id")
    .ilike("email", email)
    .neq("id", userId)
    .maybeSingle();
  if (clash) return { ok: false, error: "Another user already uses that email." };

  const { error } = await db
    .from("im_profiles")
    .update({
      name,
      email,
      role: input.role,
      disability_type: input.disability_type || null,
      assistive_needs: input.assistive_needs || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  await audit(admin.user_id, "updated_user", `user:${userId}`);
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deleteUser(userId: number): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  if (userId === admin.user_id)
    return { ok: false, error: "You cannot delete the account you are signed in with." };
  const db = createAdminClient();
  const { data: user } = await db
    .from("im_profiles")
    .select("role, auth_user_id")
    .eq("id", userId)
    .maybeSingle();
  if (!user) return { ok: false, error: "User not found." };
  const { error } = await db.from("im_profiles").delete().eq("id", userId);
  if (error) return { ok: false, error: error.message };

  // Delete the auth user too. Deleting only the profile used to leave a live
  // credential behind that could still authenticate (it now resolves to a null
  // session, but it also blocked the address from ever being re-registered).
  // A failure here must not undo the profile deletion the admin asked for, so
  // it is logged rather than surfaced as an error.
  if (user.auth_user_id) {
    const { error: authErr } = await db.auth.admin.deleteUser(user.auth_user_id);
    if (authErr) {
      await audit(admin.user_id, "delete_auth_user_failed", `user:${userId}:${authErr.message}`);
    }
  }

  await audit(admin.user_id, `deleted_user_${user.role}`, `user:${userId}`);
  revalidatePath("/admin/users");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Excel export (ISO 8601 dates, ISO 4217 PHP, resolved display names)
// ---------------------------------------------------------------------------

export interface ExportResult {
  ok: boolean;
  error?: string;
  fileBase64?: string;
  filename?: string;
}

export async function exportReport(type: ReportType): Promise<ExportResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };

  try {
    const { workbook, filename } = await buildReportWorkbook(type);
    const buffer = await workbook.xlsx.writeBuffer();
    const fileBase64 = Buffer.from(buffer).toString("base64");

    await audit(admin.user_id, "exported_report", `report:${type}:${filename}`);

    return { ok: true, fileBase64, filename };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not generate the report.";
    return { ok: false, error: message };
  }
}

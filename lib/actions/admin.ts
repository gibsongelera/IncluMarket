"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { buildReportWorkbook } from "@/lib/reports/excel";
import { boundedText } from "@/lib/validation/data-url";
import { queueEmail } from "@/lib/email/send";
import type { ProductStatus, ReportType, TicketStatus } from "@/lib/types";

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
  const name = boundedText(input.name, 120);
  const email = input.email?.trim().toLowerCase();
  if (!name || name.length < 2) return { ok: false, error: "Full name is required." };
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email address." };
  if (!["buyer", "seller", "admin"].includes(input.role))
    return { ok: false, error: "Please pick a valid role." };
  // Same guard as updateUserRole, which this used to bypass: an admin editing
  // their own row could demote themselves and lock the console.
  if (userId === admin.user_id && input.role !== "admin")
    return { ok: false, error: "You cannot demote your own admin account." };

  const db = createAdminClient();
  const { data: target } = await db
    .from("im_profiles")
    .select("email, auth_user_id")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { ok: false, error: "User not found." };

  const { data: clash } = await db
    .from("im_profiles")
    .select("id")
    .ilike("email", email)
    .neq("id", userId)
    .maybeSingle();
  if (clash) return { ok: false, error: "Another user already uses that email." };

  // The sign-in email lives in Supabase Auth. Changing only the profile left
  // the person signing in with the OLD address while every screen showed the
  // new one. Auth first: if it refuses, nothing is changed.
  if (email !== String(target.email).toLowerCase() && target.auth_user_id) {
    const { error: authErr } = await db.auth.admin.updateUserById(target.auth_user_id, {
      email,
      email_confirm: true,
    });
    if (authErr) return { ok: false, error: "Could not change the sign-in email. It may already be in use." };
  }

  const { error } = await db
    .from("im_profiles")
    .update({
      name,
      email,
      role: input.role,
      disability_type: boundedText(input.disability_type ?? "", 120),
      assistive_needs: boundedText(input.assistive_needs ?? "", 200),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return { ok: false, error: "Could not save the user. Please try again." };
  await audit(admin.user_id, "updated_user", `user:${userId}`);
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Sign-in ban length for a suspended account (effectively indefinite). */
const SUSPEND_BAN = "876000h";

/**
 * Suspend or restore an account, with a reason.
 *
 * getSession() has honoured account_status since migration 0007, but nothing
 * ever wrote it, so suspension did not exist (B-14). The ban is applied in
 * Supabase Auth too, so a suspended user cannot sign in or refresh a session
 * at all, not just be bounced by the app.
 */
export async function setAccountStatus(
  userId: number,
  status: "active" | "suspended",
  reason: string
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  if (status !== "active" && status !== "suspended") return { ok: false, error: "Invalid status." };
  if (userId === admin.user_id) return { ok: false, error: "You cannot suspend your own account." };
  const why = boundedText(reason, 500);
  if (!why || why.length < 5)
    return { ok: false, error: "Please give a short reason (it is kept in the audit log)." };

  const db = createAdminClient();
  const { data: target } = await db
    .from("im_profiles")
    .select("id, name, email, auth_user_id, account_status")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { ok: false, error: "User not found." };
  if (target.account_status === status)
    return { ok: false, error: status === "active" ? "This account is already active." : "This account is already suspended." };

  if (target.auth_user_id) {
    const { error: banErr } = await db.auth.admin.updateUserById(target.auth_user_id, {
      ban_duration: status === "suspended" ? SUSPEND_BAN : "none",
    });
    if (banErr) return { ok: false, error: "Could not update sign-in access. Please try again." };
  }

  const { error } = await db
    .from("im_profiles")
    .update({ account_status: status, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return { ok: false, error: "Could not update the account. Please try again." };

  await audit(
    admin.user_id,
    status === "suspended" ? "suspended_user" : "restored_user",
    `user:${userId} reason:${why}`
  );
  if (target.email && !String(target.email).endsWith(".invalid")) {
    await queueEmail(
      "account_status",
      { email: target.email, name: target.name },
      { status, reason: why, name: target.name }
    );
  }
  revalidatePath("/admin/users");
  revalidatePath("/home");
  return { ok: true };
}

/** How much history an account carries — decides delete vs anonymize. */
async function accountFootprint(db: ReturnType<typeof createAdminClient>, userId: number) {
  const [orders, products] = await Promise.all([
    db.from("im_orders").select("id", { count: "exact", head: true }).eq("buyer_id", userId),
    db.from("im_products").select("id", { count: "exact", head: true }).eq("seller_id", userId),
  ]);
  return { orders: orders.count ?? 0, products: products.count ?? 0 };
}

/**
 * Remove a person's identity but keep the marketplace record.
 *
 * Deleting a profile cascades through im_orders.buyer_id and
 * im_products.seller_id, which erased sellers' sales history and buyers'
 * purchases along with the person (B-14). Anonymising honours an RA 10173
 * erasure request while orders, reviews and reports stay intact: name and
 * contact details are replaced, sensitive fields cleared, personal lists
 * deleted, and the sign-in itself removed.
 */
export async function anonymizeUser(userId: number): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Admin access required." };
  if (userId === admin.user_id) return { ok: false, error: "You cannot anonymise your own account." };

  const db = createAdminClient();
  const { data: target } = await db
    .from("im_profiles")
    .select("id, auth_user_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { ok: false, error: "User not found." };

  const { error } = await db
    .from("im_profiles")
    .update({
      name: "Anonymous",
      email: `deleted-${userId}@users.invalid`,
      phone: null,
      disability_type: null,
      assistive_needs: null,
      seller_story: null,
      pwd_id_url: null,
      is_featured_seller: false,
      account_status: "suspended",
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return { ok: false, error: "Could not anonymise the account. Please try again." };

  await Promise.all([
    db.from("im_cart_items").delete().eq("user_id", userId),
    db.from("im_wishlists").delete().eq("user_id", userId),
    db.from("im_ui_prefs").delete().eq("user_id", userId),
    db.from("im_notifications").delete().eq("user_id", userId),
  ]);

  if (target.auth_user_id) {
    const { error: authErr } = await db.auth.admin.deleteUser(target.auth_user_id);
    if (authErr) await audit(admin.user_id, "anonymize_auth_delete_failed", `user:${userId}`);
  }
  await audit(admin.user_id, `anonymized_user_${target.role}`, `user:${userId}`);
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

  // Never hard-delete an account that has orders or products: the cascade
  // would erase other people's records too. Suspend or anonymise instead.
  const footprint = await accountFootprint(db, userId);
  if (footprint.orders > 0 || footprint.products > 0) {
    return {
      ok: false,
      error:
        "This account has orders or products, so deleting it would erase sales records. Suspend it, or use Anonymise to remove the personal data.",
    };
  }

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

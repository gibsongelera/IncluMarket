"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { guardByIp } from "@/lib/security/rate-limit";
import { maskEmail } from "@/lib/format";

/**
 * Role-scoped dashboard search.
 *
 * The storefront typeahead (lib/actions/search.ts) only ever looks at approved
 * products, so it is safe for anyone. This one reaches across users, orders and
 * tickets, so the scope is decided HERE from the session — never from an
 * argument. A seller sees only their own products and only orders containing
 * one of their products; an admin sees everything; anyone else gets nothing.
 *
 * Every result carries a server-computed `href`, so the client never builds a
 * destination out of user input.
 */

export type ScopedResultKind = "product" | "order" | "user" | "ticket";

export interface ScopedResult {
  /** Stable key for React; not necessarily the row id. */
  key: string;
  kind: ScopedResultKind;
  /** Human label for the group heading, e.g. "Products". */
  group: string;
  label: string;
  sublabel?: string;
  href: string;
}

const PER_KIND = 4;
const MAX_QUERY = 60;

/** Escape LIKE wildcards so `%` searches for a percent sign. */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => "\\" + c);
}

/** Digits only, for matching an order number like "#1042" or "1042". */
function asOrderId(q: string): number | null {
  const digits = q.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isInteger(n) && n > 0 && n < 2_147_483_647 ? n : null;
}

export async function suggestScoped(query: string): Promise<ScopedResult[]> {
  const session = await getSession();
  if (!session || (session.role !== "seller" && session.role !== "admin")) return [];

  const q = String(query || "").trim().slice(0, MAX_QUERY);
  if (q.length < 2) return [];

  // Authenticated, but it still fans out across several tables per keystroke.
  const guard = await guardByIp("search_scoped", { limit: 120, windowSeconds: 60 });
  if (guard) return [];

  const db = createAdminClient();
  const like = `%${escapeLike(q)}%`;
  const orderId = asOrderId(q);
  const out: ScopedResult[] = [];

  if (session.role === "seller") {
    // ---- own products --------------------------------------------------
    const { data: products } = await db
      .from("im_products")
      .select("id, title, status")
      .eq("seller_id", session.user_id)
      .ilike("title", like)
      .order("title")
      .limit(PER_KIND);

    for (const p of products ?? []) {
      out.push({
        key: `product-${p.id}`,
        kind: "product",
        group: "My products",
        label: p.title,
        sublabel: p.status,
        href: `/seller/products?focus=${p.id}`,
      });
    }

    // ---- own orders ----------------------------------------------------
    // Scoped by ownership, not by trusting an id from the caller: resolve the
    // seller's product ids first, then the orders those appear in.
    const { data: mine } = await db
      .from("im_products")
      .select("id")
      .eq("seller_id", session.user_id);
    const myProductIds = (mine ?? []).map((p) => p.id);

    if (myProductIds.length && orderId) {
      const { data: lines } = await db
        .from("im_order_items")
        .select("order_id")
        .eq("order_id", orderId)
        .in("product_id", myProductIds)
        .limit(1);

      if (lines?.length) {
        const { data: order } = await db
          .from("im_orders")
          .select("id, order_status, total_amount")
          .eq("id", orderId)
          .maybeSingle();
        if (order) {
          out.push({
            key: `order-${order.id}`,
            kind: "order",
            group: "Orders",
            label: `Order #${order.id}`,
            sublabel: order.order_status,
            href: `/seller/orders?status=${order.order_status}&focus=${order.id}`,
          });
        }
      }
    }

    return out;
  }

  // ---- admin -------------------------------------------------------------
  const { data: users } = await db
    .from("im_profiles")
    .select("id, name, email, role")
    .or(`name.ilike.${like},email.ilike.${like}`)
    .order("name")
    .limit(PER_KIND);

  for (const u of users ?? []) {
    out.push({
      key: `user-${u.id}`,
      kind: "user",
      group: "Users",
      label: u.name,
      // Matches how the admin table renders it — masked even for an admin.
      sublabel: `${u.role} · ${maskEmail(u.email)}`,
      href: `/admin/users?q=${encodeURIComponent(u.name)}&focus=${u.id}`,
    });
  }

  const { data: products } = await db
    .from("im_products")
    .select("id, title, status")
    .ilike("title", like)
    .order("title")
    .limit(PER_KIND);

  for (const p of products ?? []) {
    out.push({
      key: `product-${p.id}`,
      kind: "product",
      group: "Products",
      label: p.title,
      sublabel: p.status,
      href: `/admin/products?status=${p.status}&focus=${p.id}`,
    });
  }

  const { data: tickets } = await db
    .from("im_support_tickets")
    .select("id, subject, ticket_status")
    .ilike("subject", like)
    .order("updated_at", { ascending: false })
    .limit(PER_KIND);

  for (const t of tickets ?? []) {
    out.push({
      key: `ticket-${t.id}`,
      kind: "ticket",
      group: "Tickets",
      label: t.subject,
      sublabel: t.ticket_status,
      href: `/admin/tickets?status=${t.ticket_status}&ticket=${t.id}`,
    });
  }

  if (orderId) {
    const { data: order } = await db
      .from("im_orders")
      .select("id, order_status")
      .eq("id", orderId)
      .maybeSingle();
    if (order) {
      out.push({
        key: `order-${order.id}`,
        kind: "order",
        group: "Orders",
        label: `Order #${order.id}`,
        sublabel: order.order_status,
        href: `/admin/reports?focus=${order.id}`,
      });
    }
  }

  return out;
}

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { money } from "@/lib/format";
import type { ChatIdentity } from "./identity";

/**
 * Live, role-scoped data for the chatbot.
 *
 * The restriction here is STRUCTURAL, not a prompt instruction. Each branch
 * queries only what that role is allowed to see — a buyer's queries are
 * filtered by their own buyer_id, a seller's by their own seller_id — so the
 * model is never given another user's data in the first place. Asking a model
 * politely not to reveal something it can see is not access control; not
 * putting it in the prompt is.
 *
 * Everything is aggregated or shortened deliberately. The bot answers "your
 * most recent order is #1042, shipped" — it is not a data export, and the
 * fewer raw fields it carries the less there is to leak if a prompt-injection
 * attempt ever gets through.
 */

export interface ChatContext {
  /** Compact block injected into the system prompt. */
  summary: string;
  /** Coarse audience label, used to pick the rule set. */
  audience: "guest" | "buyer" | "seller" | "admin";
  /** Structured facts the rule-based responder can answer from directly. */
  facts: ChatFacts;
}

export interface ChatFacts {
  orders?: { id: number; status: string; paymentStatus: string; total: number; placed: string }[];
  cartCount?: number;
  wishlistCount?: number;
  openTickets?: number;
  products?: { id: number; title: string; status: string; stock: number }[];
  lowStock?: { title: string; stock: number }[];
  pendingOrders?: number;
  averageRating?: number | null;
  platform?: {
    pendingProducts: number;
    openTickets: number;
    sellers: number;
    buyers: number;
    ordersToday: number;
  };
}

const RECENT_ORDERS = 5;
const RECENT_PRODUCTS = 8;
const LOW_STOCK_THRESHOLD = 5;

function shortDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

export async function buildChatContext(identity: ChatIdentity | null): Promise<ChatContext> {
  if (!identity || identity.kind === "guest") {
    return {
      audience: "guest",
      facts: {},
      summary:
        "VISITOR CONTEXT\nThe person is not signed in. You have no account data for them. " +
        "For anything about their own orders, cart or account, tell them to sign in first.",
    };
  }

  const db = createAdminClient();

  if (identity.role === "buyer") {
    const [{ data: orders }, { data: cart }, { data: wishlist }, { data: tickets }] =
      await Promise.all([
        db
          .from("im_orders")
          .select("id, order_status, payment_status, total_amount, created_at")
          .eq("buyer_id", identity.userId)
          .order("created_at", { ascending: false })
          .limit(RECENT_ORDERS),
        db.from("im_cart_items").select("quantity").eq("user_id", identity.userId),
        db.from("im_wishlists").select("id").eq("user_id", identity.userId),
        db
          .from("im_support_tickets")
          .select("id")
          .eq("user_id", identity.userId)
          .neq("ticket_status", "resolved"),
      ]);

    const facts: ChatFacts = {
      orders: (orders ?? []).map((o) => ({
        id: o.id,
        status: o.order_status,
        paymentStatus: o.payment_status ?? "unpaid",
        total: Number(o.total_amount),
        placed: shortDate(o.created_at),
      })),
      cartCount: (cart ?? []).reduce((n, r) => n + Number(r.quantity || 0), 0),
      wishlistCount: (wishlist ?? []).length,
      openTickets: (tickets ?? []).length,
    };

    const orderLines = facts.orders?.length
      ? facts.orders
          .map(
            (o) =>
              `- Order #${o.id}: ${o.status}, payment ${o.paymentStatus}, ${money(o.total)}, placed ${o.placed}`
          )
          .join("\n")
      : "- (no orders yet)";

    return {
      audience: "buyer",
      facts,
      summary: `BUYER CONTEXT for ${identity.name} (live data, may be referenced in your answer)
Recent orders (newest first):
${orderLines}
Items in cart: ${facts.cartCount}
Items in wishlist: ${facts.wishlistCount}
Unresolved support tickets: ${facts.openTickets}

This is the ONLY account data you have. You cannot see other people's orders,
other people's carts, seller inventory, or any admin information.`,
    };
  }

  if (identity.role === "seller") {
    const { data: products } = await db
      .from("im_products")
      .select("id, title, status")
      .eq("seller_id", identity.userId)
      .order("updated_at", { ascending: false })
      .limit(RECENT_PRODUCTS);

    const productIds = (products ?? []).map((p) => p.id);

    const [{ data: variants }, { data: reviews }] = await Promise.all([
      productIds.length
        ? db
            .from("im_product_variants")
            .select("product_id, stock_qty")
            .in("product_id", productIds)
        : Promise.resolve({ data: [] as { product_id: number; stock_qty: number }[] }),
      productIds.length
        ? db.from("im_product_reviews").select("rating_score").in("product_id", productIds)
        : Promise.resolve({ data: [] as { rating_score: number }[] }),
    ]);

    const stockByProduct = new Map<number, number>();
    for (const v of variants ?? []) {
      stockByProduct.set(
        v.product_id,
        (stockByProduct.get(v.product_id) ?? 0) + Number(v.stock_qty || 0)
      );
    }

    // Orders are scoped by ownership: only those containing one of this
    // seller's products, resolved from their own product ids.
    let pendingOrders = 0;
    if (productIds.length) {
      const { data: lines } = await db
        .from("im_order_items")
        .select("order_id")
        .in("product_id", productIds);
      const orderIds = [...new Set((lines ?? []).map((l) => l.order_id))];
      if (orderIds.length) {
        const { data: pend } = await db
          .from("im_orders")
          .select("id")
          .in("id", orderIds)
          .in("order_status", ["pending", "processing"]);
        pendingOrders = (pend ?? []).length;
      }
    }

    const scores = (reviews ?? []).map((r) => Number(r.rating_score));
    const averageRating = scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null;

    const facts: ChatFacts = {
      products: (products ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        stock: stockByProduct.get(p.id) ?? 0,
      })),
      lowStock: (products ?? [])
        .map((p) => ({ title: p.title, stock: stockByProduct.get(p.id) ?? 0 }))
        .filter((p) => p.stock <= LOW_STOCK_THRESHOLD),
      pendingOrders,
      averageRating,
    };

    const productLines = facts.products?.length
      ? facts.products
          .map((p) => `- ${p.title} — ${p.status}, ${p.stock} in stock`)
          .join("\n")
      : "- (no products listed yet)";

    return {
      audience: "seller",
      facts,
      summary: `SELLER CONTEXT for ${identity.name} (live data, may be referenced in your answer)
Your products (most recently updated):
${productLines}
Orders awaiting fulfilment: ${facts.pendingOrders}
Average review score across your products: ${facts.averageRating ?? "no reviews yet"}
Products at or below ${LOW_STOCK_THRESHOLD} in stock: ${facts.lowStock?.length ?? 0}

This is the ONLY business data you have. You cannot see other sellers'
products or sales, buyer personal details, or any admin information.`,
    };
  }

  // ---- admin -------------------------------------------------------------
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [
    { count: pendingProducts },
    { count: openTickets },
    { count: sellers },
    { count: buyers },
    { count: ordersToday },
  ] = await Promise.all([
    db.from("im_products").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db
      .from("im_support_tickets")
      .select("id", { count: "exact", head: true })
      .neq("ticket_status", "resolved"),
    db.from("im_profiles").select("id", { count: "exact", head: true }).eq("role", "seller"),
    db.from("im_profiles").select("id", { count: "exact", head: true }).eq("role", "buyer"),
    db.from("im_orders").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);

  const facts: ChatFacts = {
    platform: {
      pendingProducts: pendingProducts ?? 0,
      openTickets: openTickets ?? 0,
      sellers: sellers ?? 0,
      buyers: buyers ?? 0,
      ordersToday: ordersToday ?? 0,
    },
  };

  return {
    audience: "admin",
    facts,
    summary: `ADMIN CONTEXT for ${identity.name} (live platform totals)
Products awaiting review: ${facts.platform?.pendingProducts}
Unresolved support tickets: ${facts.platform?.openTickets}
Registered sellers: ${facts.platform?.sellers}
Registered buyers: ${facts.platform?.buyers}
Orders in the last 24 hours: ${facts.platform?.ordersToday}

These are AGGREGATES only. You do not have individual user records, contact
details, disability information, or order contents. Never invent them, and
direct the admin to the relevant dashboard page for specifics.`,
  };
}

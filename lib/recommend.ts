import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";
import { getAllCategories } from "@/lib/data";
import { getStorefrontItems, searchStorefront } from "@/lib/storefront";
import type { StorefrontItem } from "@/lib/storefront-core";

/**
 * Recommendations (C-20), described honestly: not "AI", but category affinity
 * from what a signed-in buyer viewed, saved and bought, plus "customers also
 * bought" from orders that contained the same product. Guests, buyers with
 * no history, and buyers who turned personalisation off see what is popular
 * this week instead. Every personalised rail says why it is shown.
 *
 * Views are behavioural data (Q23): signed-in buyers only, kept 90 days,
 * never recorded when personalisation is off, disclosed in the Privacy Policy.
 */

const VIEW_RETENTION_DAYS = 90;

export interface Recommendation {
  title: string;
  items: StorefrontItem[];
  /** "Because you viewed Bags" — shown with the rail. Null when not personal. */
  reason: string | null;
  personalised: boolean;
}

async function personalisationOn(profileId: number): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("im_profiles")
    .select("personalization_opt_out")
    .eq("id", profileId)
    .maybeSingle();
  if (error) return false; // before migration 0019: no views table either
  return !(data as { personalization_opt_out?: boolean } | null)?.personalization_opt_out;
}

/** Record that a signed-in buyer opened a product. Never throws. */
export async function recordProductView(profileId: number, productId: number): Promise<void> {
  try {
    if (!(await personalisationOn(profileId))) return;
    const db = createAdminClient();
    // One row per product per half hour is enough signal.
    const since = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data: recent } = await db
      .from("im_product_views")
      .select("id")
      .eq("profile_id", profileId)
      .eq("product_id", productId)
      .gte("viewed_at", since)
      .limit(1);
    if (!recent?.length) await db.from("im_product_views").insert({ profile_id: profileId, product_id: productId });

    // Retention: purge old views at most once an hour, across instances.
    const gate = await rateLimit("purge_product_views", "global", { limit: 1, windowSeconds: 3600 });
    if (gate.ok) {
      const cutoff = new Date(Date.now() - VIEW_RETENTION_DAYS * 86_400_000).toISOString();
      await db.from("im_product_views").delete().lt("viewed_at", cutoff);
    }
  } catch {
    // Recommendations are a convenience; a failure here must not affect the page.
  }
}

type Source = "viewed" | "saved" | "bought";

async function categoryAffinity(profileId: number): Promise<{ category: string; source: Source } | null> {
  const db = createAdminClient();
  const since = new Date(Date.now() - VIEW_RETENTION_DAYS * 86_400_000).toISOString();
  const [views, saves, orders] = await Promise.all([
    db.from("im_product_views").select("product_id").eq("profile_id", profileId).gte("viewed_at", since).limit(300),
    db.from("im_wishlists").select("product_id").eq("user_id", profileId).limit(200),
    db.from("im_orders").select("id").eq("buyer_id", profileId).neq("order_status", "cancelled").limit(100),
  ]);
  const orderIds = ((orders.data ?? []) as { id: number }[]).map((o) => o.id);
  const bought = orderIds.length
    ? ((await db.from("im_order_items").select("product_id").in("order_id", orderIds)).data ?? [])
    : [];

  const signals: { productId: number; source: Source; weight: number }[] = [
    ...((views.data ?? []) as { product_id: number }[]).map((r) => ({ productId: r.product_id, source: "viewed" as const, weight: 1 })),
    ...((saves.data ?? []) as { product_id: number }[]).map((r) => ({ productId: r.product_id, source: "saved" as const, weight: 2 })),
    ...(bought as { product_id: number | null }[])
      .filter((r) => r.product_id != null)
      .map((r) => ({ productId: r.product_id as number, source: "bought" as const, weight: 3 })),
  ];
  if (!signals.length) return null;

  const ids = [...new Set(signals.map((s) => s.productId))];
  const { data: products } = await db.from("im_products").select("id, category").in("id", ids);
  const catOf = new Map(((products ?? []) as { id: number; category: string | null }[]).map((p) => [p.id, p.category]));

  const score = new Map<string, { total: number; bySource: Record<Source, number> }>();
  for (const s of signals) {
    const c = catOf.get(s.productId);
    if (!c) continue;
    const entry = score.get(c) ?? { total: 0, bySource: { viewed: 0, saved: 0, bought: 0 } };
    entry.total += s.weight;
    entry.bySource[s.source] += s.weight;
    score.set(c, entry);
  }
  const top = [...score.entries()].sort((a, b) => b[1].total - a[1].total)[0];
  if (!top) return null;
  const source = (Object.entries(top[1].bySource) as [Source, number][]).sort((a, b) => b[1] - a[1])[0][0];
  return { category: top[0], source };
}

/** What sold most in the last seven days; all-time top sellers if the week was quiet. */
export async function getPopularThisWeek(limit = 6): Promise<Recommendation> {
  const db = createAdminClient();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: orders } = await db
    .from("im_orders")
    .select("id")
    .gte("created_at", since)
    .neq("order_status", "cancelled")
    .limit(500);
  const orderIds = ((orders ?? []) as { id: number }[]).map((o) => o.id);
  if (orderIds.length) {
    const { data: lines } = await db.from("im_order_items").select("product_id, quantity").in("order_id", orderIds);
    const sold = new Map<number, number>();
    for (const l of (lines ?? []) as { product_id: number | null; quantity: number }[]) {
      if (l.product_id != null) sold.set(l.product_id, (sold.get(l.product_id) ?? 0) + Number(l.quantity || 0));
    }
    const ids = [...sold.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, limit * 2);
    const items = (await getStorefrontItems(ids)).filter((i) => i.stockTotal > 0).slice(0, limit);
    if (items.length >= 3) return { title: "Popular this week", items, reason: null, personalised: false };
  }
  const top = await searchStorefront({ sort: "top_sales", pageSize: limit });
  return { title: "Popular picks", items: top.items.filter((i) => i.stockTotal > 0), reason: null, personalised: false };
}

export async function getHomeRecommendations(profileId: number | null): Promise<Recommendation> {
  if (profileId && (await personalisationOn(profileId))) {
    try {
      const affinity = await categoryAffinity(profileId);
      if (affinity) {
        const [{ items }, categories] = await Promise.all([
          searchStorefront({ category: affinity.category, sort: "top_sales", pageSize: 12 }),
          getAllCategories(),
        ]);
        const cat = categories.find((c) => c.id === affinity.category);
        const name = cat ? cat.folder || cat.label : affinity.category;
        const picks = items.filter((i) => i.stockTotal > 0).slice(0, 6);
        if (picks.length >= 3) {
          const reason =
            affinity.source === "viewed"
              ? `Because you viewed ${name}`
              : affinity.source === "saved"
                ? `Because you saved items in ${name}`
                : `Because you bought from ${name}`;
          return { title: "Recommended for you", items: picks, reason, personalised: true };
        }
      }
    } catch {
      // Fall through to the non-personal rail.
    }
  }
  return getPopularThisWeek();
}

/** Products that appeared in the same orders as this one. */
export async function getAlsoBought(productId: number, limit = 6): Promise<StorefrontItem[]> {
  const db = createAdminClient();
  const { data: withIt } = await db.from("im_order_items").select("order_id").eq("product_id", productId).limit(300);
  const orderIds = [...new Set(((withIt ?? []) as { order_id: number }[]).map((r) => r.order_id))];
  if (!orderIds.length) return [];
  const { data: lines } = await db.from("im_order_items").select("product_id").in("order_id", orderIds).neq("product_id", productId);
  const together = new Map<number, number>();
  for (const l of (lines ?? []) as { product_id: number | null }[]) {
    if (l.product_id != null) together.set(l.product_id, (together.get(l.product_id) ?? 0) + 1);
  }
  const ids = [...together.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, limit * 2);
  return (await getStorefrontItems(ids)).filter((i) => i.stockTotal > 0).slice(0, limit);
}

import { redirect } from "next/navigation";
import { getSession, homeForRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { LandingClient } from "@/components/LandingClient";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const session = await getSession().catch(() => null);
  if (session) redirect(homeForRole(session.role));

  let stats = { products: 0, sellers: 0, orders: 0 };
  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const db = createAdminClient();
      const [products, sellers, orders] = await Promise.all([
        db.from("im_products").select("*", { count: "exact", head: true }),
        db.from("im_profiles").select("*", { count: "exact", head: true }).eq("role", "seller"),
        db.from("im_orders").select("*", { count: "exact", head: true }),
      ]);
      stats = {
        products: products.count ?? 0,
        sellers: sellers.count ?? 0,
        orders: orders.count ?? 0,
      };
    }
  } catch {
    // Keep zeroed stats if DB/env unavailable at build or first boot.
  }

  return <LandingClient stats={stats} />;
}

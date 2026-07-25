import { redirect } from "next/navigation";
import { getSession, homeForRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { LandingClient } from "@/components/LandingClient";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const session = await getSession();
  if (session) redirect(homeForRole(session.role));

  const db = createAdminClient();
  const [products, sellers, orders] = await Promise.all([
    db.from("im_products").select("*", { count: "exact", head: true }),
    db.from("im_profiles").select("*", { count: "exact", head: true }).eq("role", "seller"),
    db.from("im_orders").select("*", { count: "exact", head: true }),
  ]);

  return (
    <LandingClient
      stats={{
        products: products.count ?? 0,
        sellers: sellers.count ?? 0,
        orders: orders.count ?? 0,
      }}
    />
  );
}

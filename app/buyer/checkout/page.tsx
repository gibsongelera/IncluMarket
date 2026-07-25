import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CheckoutClient } from "@/components/CheckoutClient";
import { getAllProducts, getVariants } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const session = await requireRole(["buyer"]);
  const [products, variants] = await Promise.all([getAllProducts(), getVariants()]);

  return (
    <>
      <SiteHeader variant="buyer" active="home" session={session} />
      <main id="main" className="container main--checkout">
        <h1>Checkout</h1>
        <CheckoutClient
          userId={session.user_id}
          userName={session.name}
          products={products.map((p) => ({
            id: p.id,
            title: p.title,
            image: p.image,
            images: p.images ?? null,
          }))}
          variants={variants.map((v) => ({
            id: v.id,
            color_name: v.color_name,
            size: v.size,
          }))}
        />
      </main>
      <SiteFooter />
    </>
  );
}

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CheckoutClient } from "@/components/CheckoutClient";
import { getCartItems } from "@/lib/actions/cart";
import { getAllProducts, getVariants } from "@/lib/data";
import { isPayMongoConfigured } from "@/lib/payments/paymongo";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const session = await requireRole(["buyer"]);
  const [items, products, variants] = await Promise.all([
    getCartItems(),
    getAllProducts(),
    getVariants(),
  ]);

  if (!items.length) redirect("/buyer/cart");

  return (
    <>
      <SiteHeader variant="buyer" active="home" session={session} />
      <main id="main" tabIndex={-1} className="container main--checkout">
        <h1>Checkout</h1>
        <CheckoutClient
          userName={session.name}
          onlinePaymentEnabled={isPayMongoConfigured()}
          items={items}
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

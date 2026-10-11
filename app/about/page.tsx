import { StaticPageLayout } from "@/components/StaticPageLayout";
import { SITE } from "@/lib/site";

export const metadata = { title: "About us" };

export default function AboutPage() {
  return (
    <StaticPageLayout title={`About ${SITE.name}`}>
      <p>
        {SITE.name} is an online shop for products and services made by persons with disabilities (PWD) — trainees and
        graduates of {SITE.operator}. It gives them a place to sell bags, clothes, crafts, food and more, and to earn
        from their work. It is part of the {SITE.ecosystem} project.
      </p>

      <h2>Who sells here</h2>
      <p>
        Sellers verify their PWD ID with AVRC staff before their products are listed. Every listing is reviewed by an
        administrator before buyers can see it, and again when its name, price, photos or description change.
      </p>

      <h2>How buying works</h2>
      <ul>
        <li>Pay cash on delivery, or online with GCash, Maya, GrabPay or a card through PayMongo.</li>
        <li>Each seller ships their own items, so an order from two sellers arrives as two parcels.</li>
        <li>You can ask to return an item within the return window after delivery; an administrator steps in if you and
          the seller disagree.</li>
        <li>Verified PWD buyers get a discount only where a discount rule applies to that item. Each rule names its legal
          basis.</li>
      </ul>

      <h2>Built to be usable</h2>
      <p>
        The shop works with a keyboard and screen readers, text can be enlarged to twice its size, and there are options
        for high contrast, reduced motion and reading aloud. Our <a href="/accessibility">accessibility statement</a>{" "}
        lists what works and what we are still fixing.
      </p>
    </StaticPageLayout>
  );
}

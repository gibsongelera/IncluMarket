import { StaticPageLayout } from "@/components/StaticPageLayout";

export const metadata = { title: "About Us — IncluMarket" };

export default function AboutPage() {
  return (
    <StaticPageLayout title="About IncluMarket">
      <p>
        IncluMarket is an accessible online marketplace built for persons with
        disabilities (PWD) to sell what they make — bags, apparel, crafts,
        food, accessories, wellness items, and services — directly to
        buyers, without a storefront being a barrier in itself.
      </p>
      <p>
        IncluMarket is part of the wider <strong>IncluTrack</strong>{" "}
        ecosystem. The platform runs three roles — buyers, sellers, and
        administrators — with every seller listing reviewed before it goes
        live, and every account protected by role-based access control at
        the database layer, not just the interface.
      </p>
      <h2>Why accessibility comes first</h2>
      <p>
        The site is built to WCAG 2.1 AA and is being extended toward WCAG
        2.2: keyboard-operable controls throughout, a persisted high-contrast
        mode, reduced-motion support, and screen-reader-friendly landmarks
        and live regions. See our{" "}
        <a href="/accessibility">Accessibility Statement</a> for the full
        detail.
      </p>
      <h2>Why PWD-made goods</h2>
      <p>
        Every seller on IncluMarket is a person with a disability running
        their own livelihood. Some listings are adapted specifically for
        other PWD buyers — magnetic closures instead of buttons, one-handed
        zippers, seated-fit clothing — because the people making them know
        exactly what that friction feels like.
      </p>
    </StaticPageLayout>
  );
}

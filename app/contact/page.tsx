import { StaticPageLayout } from "@/components/StaticPageLayout";

export const metadata = { title: "Contact — IncluMarket" };

export default function ContactPage() {
  return (
    <StaticPageLayout title="Contact us">
      <p>
        Already have an account? The fastest way to reach us is the{" "}
        <strong>Support</strong> tab inside IncluMarket (buyers) or by
        replying on an open order — support tickets are tracked and answered
        by our team, with a full response history you can revisit anytime.
      </p>
      <p>
        Have a question before signing up, a press inquiry, or a partnership
        idea? Email us and we'll route it to the right person.
      </p>
      <h2>General inquiries</h2>
      <p>
        <a href="mailto:hello@inclumarket.example">hello@inclumarket.example</a>
      </p>
      <h2>Accessibility feedback</h2>
      <p>
        If something on the site is hard to use with a screen reader,
        keyboard, or switch device, we want to know — this feedback goes
        directly into fixing it, not a queue.
      </p>
      <p>
        <a href="mailto:accessibility@inclumarket.example">
          accessibility@inclumarket.example
        </a>
      </p>
      <h2>Selling on IncluMarket</h2>
      <p>
        Sign up as a seller from the homepage — every new listing is
        reviewed before it appears in the marketplace, usually within one
        business day.
      </p>
    </StaticPageLayout>
  );
}

import { StaticPageLayout } from "@/components/StaticPageLayout";

export const metadata = { title: "Terms — IncluMarket" };

export default function TermsPage() {
  return (
    <StaticPageLayout title="Terms of Service">
      <p>
        These terms govern your use of IncluMarket. By creating an account
        you agree to them.
      </p>
      <h2>Accounts</h2>
      <p>
        You must provide accurate information when registering. Admin
        accounts are provisioned directly and are not available through
        public sign-up. You're responsible for activity under your account.
      </p>
      <h2>Selling on IncluMarket</h2>
      <p>
        Sellers list products for review before they go live. IncluMarket
        (via its administrators) may approve, flag, or remove a listing that
        violates these terms or applicable law. Sellers are responsible for
        the accuracy of their listings and for fulfilling orders they accept.
      </p>
      <h2>Buying on IncluMarket</h2>
      <p>
        Orders are a contract between buyer and seller; IncluMarket
        facilitates the transaction and provides order tracking, messaging,
        and a support-ticket escalation path if something goes wrong.
      </p>
      <h2>Reviews</h2>
      <p>
        Reviews must reflect a genuine experience with the product. One
        review per buyer per product is permitted, and can be edited but not
        duplicated.
      </p>
      <h2>Prohibited use</h2>
      <p>
        Do not use IncluMarket to list illegal goods, harass another user, or
        attempt to bypass the platform's security or role restrictions.
        Violations may result in account suspension.
      </p>
      <h2>Changes</h2>
      <p>
        We may update these terms as the platform evolves. Material changes
        will be communicated through the in-app notification center.
      </p>
    </StaticPageLayout>
  );
}

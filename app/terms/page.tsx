import { StaticPageLayout } from "@/components/StaticPageLayout";
import { getSettingInts } from "@/lib/settings";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Terms of use" };

export default async function TermsPage() {
  const s = await getSettingInts({ return_window_days: 7 });
  return (
    <StaticPageLayout title="Terms of use">
      <p>
        These terms cover your use of {SITE.name}, run by {SITE.operator}. By creating an account you agree to them.
      </p>

      <h2>Accounts</h2>
      <p>
        Give accurate details when you sign up and keep your password to yourself; you are responsible for what happens
        under your account. Administrator accounts are created by AVRC staff, not through sign-up. We may suspend an
        account that breaks these terms, and we tell you why.
      </p>

      <h2>Selling</h2>
      <p>
        Sellers verify their PWD ID before their products are listed. Every listing is reviewed before it appears, and
        again when its name, price, photos or description change. We may decline, hide or remove a listing that breaks
        these terms or the law, and we tell the seller why. Sellers are responsible for describing their items honestly,
        shipping the orders they accept, and handling returns.
      </p>

      <h2>Buying</h2>
      <p>
        A sale is between you and the seller; {SITE.name} runs the shop, the checkout and the help desk. You can cancel
        an order until it ships, and ask for a return within {s.return_window_days} days of delivery. If you and the
        seller disagree, an administrator decides.
      </p>

      <h2>PWD discounts</h2>
      <p>
        A PWD discount applies only to items covered by a discount rule, and only for a buyer with an approved, unexpired
        PWD verification. Using someone else&rsquo;s ID, or a false one, ends the verification and may end the account.
      </p>

      <h2>Reviews</h2>
      <p>
        Reviews must describe your own experience. You can leave one review per product and edit it later. We may hide a
        review that is abusive, shares personal details, is spam, or is not about the product, and we tell you why.
      </p>

      <h2>Not allowed</h2>
      <p>
        Listing illegal or dangerous goods, harassing anyone, or trying to get around the shop&rsquo;s security or
        another person&rsquo;s account.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms. We will tell you about important changes in the app before they apply.</p>
    </StaticPageLayout>
  );
}

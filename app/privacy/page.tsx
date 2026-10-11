import { StaticPageLayout } from "@/components/StaticPageLayout";
import { getPwdSettings } from "@/lib/settings";
import { CONTACT_RETENTION_DAYS, SITE } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy Policy" };

/**
 * Privacy Policy (N-26): only what the system actually does. Retention
 * numbers come from Admin → Settings, so the page cannot drift from them.
 */
export default async function PrivacyPage() {
  const pwd = await getPwdSettings();
  return (
    <StaticPageLayout title="Privacy Policy">
      <p>
        {SITE.name}, run by {SITE.operator}, handles personal data under the Philippine Data Privacy Act of 2012 (RA
        10173). This page explains what we collect, why, who sees it and how long we keep it.
      </p>

      <h2>What we collect, and why</h2>
      <ul>
        <li>
          <strong>Your account:</strong> name, email, role, and any profile details you add. Needed to sign you in and
          run your orders.
        </li>
        <li>
          <strong>Orders:</strong> items, prices, delivery name, address and phone, and payment status. Online payments
          are handled by PayMongo; we never see or store card numbers or e-wallet passwords.
        </li>
        <li>
          <strong>PWD verification (optional):</strong> a photo of your PWD ID, its number, the issuing city or
          municipality and the expiry date. We use it to confirm you can sell here or receive a PWD discount. The number
          is stored as a one-way code plus its last four digits; a locked copy of the full number is kept only until a
          reviewer decides, then erased. ID photos are deleted {pwd.pwd_id_retention_days} days after the decision.
        </li>
        <li>
          <strong>Products you view</strong> (signed-in buyers only), to suggest similar items. Kept 90 days. You can
          turn this off in Account → Privacy.
        </li>
        <li>
          <strong>Reviews, messages and help requests</strong> you write.
        </li>
        <li>
          <strong>Contact form messages:</strong> your name, email and message, kept up to {CONTACT_RETENTION_DAYS / 365}{" "}
          year to answer you.
        </li>
        <li>
          <strong>Newsletter:</strong> your email, only if you subscribe. Stop it any time with the unsubscribe link in
          our emails, in Account → Privacy, or through the contact form.
        </li>
        <li>
          <strong>Records of consent and important actions</strong> (an audit log), kept for accountability.
        </li>
      </ul>

      <h2>Who sees it</h2>
      <ul>
        <li>
          A seller sees what they need to deliver your order: your shortened name, delivery address and phone. When you
          get a PWD discount on their item, they also see the last four digits of your PWD ID. Sellers do not see your
          email.
        </li>
        <li>Other shoppers see your shortened name (for example &ldquo;Maria S.&rdquo;) on reviews you post.</li>
        <li>
          Administrators — AVRC staff — see what they need to review listings, verify PWD IDs, settle disputes and answer
          requests. Opening someone&rsquo;s ID photos or full ID number is recorded in the audit log.
        </li>
        <li>
          Service providers process data for us: Supabase (database and sign-in), PayMongo (online payments), our email
          provider, and our hosting provider.
        </li>
      </ul>

      <h2>How it is protected</h2>
      <ul>
        <li>Pages and data travel over HTTPS. Passwords are handled by Supabase Auth and are never stored by us.</li>
        <li>
          The application reads and writes data on the server, after checking who you are and what your role allows.
          Database rules also block direct access from browsers.
        </li>
        <li>PWD ID photos are in private storage, opened only through links that expire after a minute.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask for a copy of your data, a correction, deletion, or for us to stop a use of it. Signed in, use
        Account → Privacy; otherwise use the <a href="/contact">contact form</a> and choose &ldquo;My personal
        data&rdquo;. We answer within 15 days. Some records, such as audit entries about a deleted account, are kept in
        a form that no longer identifies you. If you are not satisfied with our answer, you may complain to the
        National Privacy Commission.
      </p>
    </StaticPageLayout>
  );
}

import { StaticPageLayout } from "@/components/StaticPageLayout";

export const metadata = { title: "Privacy Policy — IncluMarket" };

export default function PrivacyPage() {
  return (
    <StaticPageLayout title="Privacy Policy">
      <p>
        IncluMarket processes personal data in line with the Philippine Data
        Privacy Act of 2012 (RA 10173). This page explains what we collect,
        why, and how it's protected.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: name, email, role, and — optionally — disability type and assistive needs, provided voluntarily to help sellers and support staff serve you better.</li>
        <li>Order and payment records needed to fulfil purchases.</li>
        <li>Product reviews and messages you choose to post or send.</li>
        <li>Consent and audit records of account and data actions, kept for accountability even if the underlying record is later changed.</li>
      </ul>
      <h2>How it's protected</h2>
      <ul>
        <li>Row-level security at the database layer restricts every table to the people who should see it — your own data, or data your role legitimately needs (e.g. a seller sees masked buyer emails, never full ones).</li>
        <li>Administrative actions are logged in an audit trail that only administrators can read.</li>
        <li>Sensitive credentials are never exposed to the browser; all privileged operations run through server-side checks before touching the database.</li>
      </ul>
      <h2>Your rights</h2>
      <p>
        Under RA 10173 you may request access to, correction of, or deletion
        of your personal data. Contact{" "}
        <a href="mailto:privacy@inclumarket.example">privacy@inclumarket.example</a>{" "}
        to exercise these rights. Some records — such as audit logs tied to a
        deleted account — are retained in de-identified form to preserve the
        integrity of the compliance trail.
      </p>
      <h2>Marketing communications</h2>
      <p>
        Newsletter subscription is opt-in via the footer signup form. You can
        unsubscribe at any time by contacting us.
      </p>
    </StaticPageLayout>
  );
}

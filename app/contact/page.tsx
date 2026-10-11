import Link from "next/link";
import { StaticPageLayout } from "@/components/StaticPageLayout";
import { ContactForm } from "@/components/ContactForm";
import { getRenderSession } from "@/lib/session";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contact" };

export default async function ContactPage() {
  const session = await getRenderSession().catch(() => null);
  const helpHref = session?.role === "seller" ? "/seller/support" : "/buyer/support";
  return (
    <StaticPageLayout title="Contact us">
      <p>
        {SITE.name} is run by {SITE.operator} in {SITE.region}. Send us a message with the form below and we will reply by
        email.
      </p>
      {session && session.role !== "admin" ? (
        <p>
          About an order or your account? <Link href={helpHref}>Open a help request</Link> instead — you can follow the
          replies there.
        </p>
      ) : null}
      {SITE.contactEmail || SITE.contactPhone ? (
        <ul>
          {SITE.contactEmail ? (
            <li>
              Email: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
            </li>
          ) : null}
          {SITE.contactPhone ? <li>Phone: {SITE.contactPhone}</li> : null}
        </ul>
      ) : null}

      <h2>Send a message</h2>
      <ContactForm name={session?.name ?? ""} email={session?.email ?? ""} /> {/* props-ok: prefills the signed-in user's own name and email */}

      <h2>Something hard to use?</h2>
      <p>
        If a page does not work with your screen reader, keyboard, switch, voice control or zoom, choose
        &ldquo;Something hard to use&rdquo; above and tell us the page and what happened. We treat these reports as
        bugs.
      </p>

      <h2>Selling here</h2>
      <p>
        Sellers are PWD trainees and graduates of {SITE.operator}. To start, create a seller account and verify your PWD
        ID; AVRC staff review it, and your listings are reviewed before they appear in the shop.
      </p>
    </StaticPageLayout>
  );
}

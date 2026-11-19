import Link from "next/link";
import { Icon } from "./Icon";
import { NewsletterForm } from "./NewsletterForm";
import { SITE } from "@/lib/site";

/**
 * Site footer. Social links show only once a real profile URL is set in
 * lib/site.ts (from the environment); until then there is no "Follow us"
 * column at all, rather than icons that go nowhere (B-19, Q11).
 */
export function SiteFooter() {
  const social = [
    { name: "Facebook", href: SITE.social.facebook, icon: "facebook" as const },
    { name: "Instagram", href: SITE.social.instagram, icon: "instagram" as const },
  ].filter((s): s is { name: string; href: string; icon: "facebook" | "instagram" } => Boolean(s.href));

  return (
    <footer className="site-footer" role="contentinfo">
      <div className="container footer-grid">
        <div>
          <h2>{SITE.name}</h2>
          <ul className="footer-links">
            <li>
              <Link href="/about">About us</Link>
            </li>
            <li>
              <Link href="/faq">Help &amp; FAQ</Link>
            </li>
            <li>
              <Link href="/contact">Contact</Link>
            </li>
          </ul>
        </div>
        <div>
          <h2>Legal</h2>
          <ul className="footer-links">
            <li>
              <Link href="/privacy">Privacy Policy</Link>
            </li>
            <li>
              <Link href="/terms">Terms of use</Link>
            </li>
            <li>
              <Link href="/accessibility">Accessibility statement</Link>
            </li>
          </ul>
        </div>
        {social.length ? (
          <div>
            <h2>Follow us</h2>
            <ul className="footer-social">
              {social.map((s) => (
                <li key={s.name}>
                  <a href={s.href} rel="noopener noreferrer">
                    <Icon name={s.icon} size={16} />
                    <span className="sr-only">{SITE.socialName} on </span>
                    {s.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div>
          <h2>Newsletter</h2>
          <p className="muted small">New products from PWD sellers and flash sales. We send rarely.</p>
          <NewsletterForm />
        </div>
      </div>
      <section className="container footer-partner" aria-labelledby="footer-partner-title">
        <h2 id="footer-partner-title">In partnership with</h2>
        <div className="footer-partner__body">
          <div className="footer-partner__logos">
            {SITE.partner.logos.map((logo) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={logo.src} src={logo.src} alt={logo.alt} width={logo.width} height={logo.height} />
            ))}
          </div>
          <div className="footer-partner__text">
            <p>
              <strong>{SITE.partner.name}</strong>
              <br />
              {SITE.partner.office}
            </p>
            {SITE.contactAddress ? <p className="small">{SITE.contactAddress}</p> : null}
            <ul className="footer-partner__links">
              {SITE.contactEmail ? (
                <li>
                  <a href={`mailto:${SITE.contactEmail}`}>
                    <span className="sr-only">Email: </span>
                    {SITE.contactEmail}
                  </a>
                </li>
              ) : null}
              {SITE.contactPhone ? (
                <li>
                  {SITE.contactPhoneHref ? (
                    <a href={SITE.contactPhoneHref}>
                      <span className="sr-only">Phone: </span>
                      {SITE.contactPhone}
                    </a>
                  ) : (
                    <span className="footer-partner__plain">Phone: {SITE.contactPhone}</span>
                  )}
                </li>
              ) : null}
              {SITE.partner.website ? (
                <li>
                  <a href={SITE.partner.website} rel="noopener noreferrer">DSWD Field Office IX website</a>
                </li>
              ) : null}
              {SITE.partner.facebook ? (
                <li>
                  <a href={SITE.partner.facebook} rel="noopener noreferrer">DSWD Field Office IX on Facebook</a>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </section>
      <div className="footer-bottom">
        <p>
          &copy; {new Date().getFullYear()} {SITE.name} · Run by {SITE.operator} · Part of {SITE.ecosystem}
        </p>
      </div>
    </footer>
  );
}

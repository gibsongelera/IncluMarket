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
                    <span className="sr-only">{SITE.name} on </span>
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
      <div className="footer-bottom">
        <p>
          &copy; {new Date().getFullYear()} {SITE.name} · Run by {SITE.operator} · Part of {SITE.ecosystem}
        </p>
      </div>
    </footer>
  );
}

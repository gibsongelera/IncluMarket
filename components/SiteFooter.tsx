import Link from "next/link";
import { Icon } from "./Icon";
import { NewsletterForm } from "./NewsletterForm";

// Real social URLs aren't set yet — see docs/REBUILD_PLAN.md "Open items
// that need the user". `href` stays undefined (not "#") so these render as
// inert, non-focusable placeholders instead of misleading dead links; drop
// in a real href per entry once the client supplies the profile URLs.
const SOCIAL_LINKS: { name: string; href?: string; icon: "facebook" | "instagram" | "x" }[] = [
  { name: "Facebook", icon: "facebook" },
  { name: "Instagram", icon: "instagram" },
  { name: "X (Twitter)", icon: "x" },
];

export function SiteFooter() {
  return (
    <footer className="site-footer" role="contentinfo">
      <div className="container footer-grid">
        <div>
          <h2>IncluMarket</h2>
          <ul className="footer-links">
            <li>
              <Link href="/about">About Us</Link>
            </li>
            <li>
              <Link href="/contact">Contact</Link>
            </li>
            <li>
              <Link href="/faq">FAQ</Link>
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
              <Link href="/terms">Terms</Link>
            </li>
            <li>
              <Link href="/accessibility">Accessibility Statement</Link>
            </li>
          </ul>
        </div>
        <div>
          <h2>Follow us</h2>
          <div className="footer-social">
            {SOCIAL_LINKS.map((s) =>
              s.href ? (
                <a key={s.name} href={s.href} aria-label={s.name} title={s.name}>
                  <Icon name={s.icon} size={16} />
                </a>
              ) : (
                <span key={s.name} aria-hidden="true" title={`${s.name} — coming soon`}>
                  <Icon name={s.icon} size={16} />
                </span>
              )
            )}
          </div>
        </div>
        <div>
          <h2>Newsletter</h2>
          <p className="muted small">Product updates, new PWD sellers, and flash sales.</p>
          <NewsletterForm />
        </div>
      </div>
      <div className="footer-bottom">
        <p>&copy; 2026 IncluMarket</p>
      </div>
    </footer>
  );
}

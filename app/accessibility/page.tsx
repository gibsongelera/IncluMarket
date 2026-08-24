import { StaticPageLayout } from "@/components/StaticPageLayout";

export const metadata = { title: "Accessibility Statement — IncluMarket" };

export default function AccessibilityPage() {
  return (
    <StaticPageLayout title="Accessibility Statement">
      <p>
        IncluMarket is built for a PWD seller and buyer community, so
        accessibility isn't an add-on — it's a build requirement. We target
        WCAG 2.1 Level AA today and are actively closing gaps toward WCAG 2.2.
      </p>
      <h2>What's already in place</h2>
      <ul>
        <li>A "Skip to main content" link on every page, and a page-specific "Skip to sign in" link on the homepage, for keyboard and screen-reader users.</li>
        <li>Semantic landmarks (banner, main, contentinfo, search) so assistive technology can navigate the page structure directly.</li>
        <li>Visible focus rings on every interactive element via <code>:focus-visible</code>, never suppressed.</li>
        <li>A persisted <strong>high-contrast mode</strong>, toggled from the header and remembered across visits.</li>
        <li><code>prefers-reduced-motion</code> support — animations and transitions are disabled site-wide for users who request it, including the landing page's animated elements.</li>
        <li>Native <code>&lt;dialog&gt;</code> elements for modals, which give correct focus-trapping and Escape-to-close behavior for free.</li>
        <li>Live regions (<code>aria-live</code>) for toast notifications, search results, and other content that updates without a page reload.</li>
        <li>Fully keyboard-operable custom controls (star ratings, tabs, search suggestions) using the appropriate ARIA roles and arrow-key navigation.</li>
      </ul>
      <h2>Known limitations</h2>
      <p>
        We're aware some data-dense admin tables are easier to scan visually
        than with a screen reader, and we're working through a full WCAG 2.2
        audit as part of an ongoing accessibility pass. If you hit a
        limitation, please tell us — see below.
      </p>
      <h2>Feedback</h2>
      <p>
        If any part of IncluMarket is difficult to use with a screen reader,
        keyboard, switch device, or magnification software, contact{" "}
        <a href="mailto:accessibility@inclumarket.example">
          accessibility@inclumarket.example
        </a>
        . We treat accessibility reports as bugs, not feature requests.
      </p>
    </StaticPageLayout>
  );
}

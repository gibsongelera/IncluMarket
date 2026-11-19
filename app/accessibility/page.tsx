import { StaticPageLayout } from "@/components/StaticPageLayout";

export const metadata = { title: "Accessibility statement" };

/** Accessibility statement (N-26): what works, what does not yet, how to tell us. */
export default function AccessibilityPage() {
  return (
    <StaticPageLayout title="Accessibility statement">
      <p>
        InclusiveMarket is made for PWD sellers and buyers, so it has to work for them. We aim to meet the Web Content
        Accessibility Guidelines (WCAG) 2.2 at level AA. We test with a keyboard, the NVDA screen reader, text enlarged
        to 24 pixels and screens 320 pixels wide. This is our own testing, not an independent audit.
      </p>

      <h2>What you can do</h2>
      <ul>
        <li>
          Use the <strong>accessibility button</strong> in the bottom corner of every page to: make text larger (up to
          twice the normal size), turn on high contrast, reduce motion, make the cursor larger, have text read aloud, flash
          the screen for alerts instead of relying on sound, and try voice commands. Your choices are remembered.
        </li>
        <li>Move through every page with a keyboard. A &ldquo;Skip to main content&rdquo; link is the first thing on each page.</li>
        <li>Find your way with a screen reader: pages have headings, landmarks and labelled buttons, and messages such
          as &ldquo;Added to cart&rdquo; are announced.</li>
        <li>Nothing needs dragging: putting photos or lists in order uses buttons such as &ldquo;Move earlier&rdquo;.</li>
        <li>Choose products with features that help, such as one-handed use, easy grip or seated fit, using the filters on
          the search page.</li>
      </ul>

      <h2>Known problems</h2>
      <ul>
        <li>Some administrator tables are long and easier to scan visually than by screen reader.</li>
        <li>Voice commands depend on your browser&rsquo;s speech recognition and work best in Chrome and Edge.</li>
        <li>PayMongo&rsquo;s payment page is run by PayMongo, so we cannot fix problems on it directly — tell us and we
          will report them.</li>
        <li>The site is in English only for now. Filipino is planned.</li>
      </ul>

      <h2>Tell us</h2>
      <p>
        If something is hard to use with your screen reader, keyboard, switch, voice control or magnifier, use the{" "}
        <a href="/contact">contact form</a> and choose &ldquo;Something hard to use&rdquo;. Tell us the page and what
        happened. We treat accessibility reports as bugs.
      </p>
    </StaticPageLayout>
  );
}

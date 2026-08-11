import { StaticPageLayout } from "@/components/StaticPageLayout";

export const metadata = { title: "FAQ — IncluMarket" };

const FAQS: { q: string; a: string }[] = [
  {
    q: "Who can sell on IncluMarket?",
    a: "IncluMarket is built for persons with disabilities (PWD) selling their own goods and services. Every seller signs up with a seller account, and every listing is reviewed by an administrator before it becomes visible to buyers.",
  },
  {
    q: "How do I track my order?",
    a: "Open My Orders — each order shows a status timeline (pending, processing, shipped, delivered) with a timestamp for every update, not just the current status.",
  },
  {
    q: "How do refunds or returns work?",
    a: "Contact the seller directly through in-app messaging, or open a support ticket if you need an administrator involved. Orders can be marked returned by the seller once a return is agreed.",
  },
  {
    q: "Can I message a seller before buying?",
    a: "Yes — use the \"Message seller\" button on any product page. This is separate from support tickets, which go to IncluMarket's admin team instead.",
  },
  {
    q: "How do I save items for later?",
    a: "Tap the heart icon on any product card or product page to add it to your Wishlist, accessible from the main navigation.",
  },
  {
    q: "What happens when an item is low on stock or on flash sale?",
    a: "You'll get an in-app notification (the bell icon in the header) for flash sales on items you've wishlisted. Sellers get notified when their own stock runs low.",
  },
  {
    q: "Is my data protected?",
    a: "Yes — see our Privacy Policy. Email addresses are masked in shared views (e.g. a seller viewing a buyer's order), and all account data changes are logged for accountability.",
  },
  {
    q: "Does IncluMarket support screen readers and keyboard navigation?",
    a: "Yes. See our Accessibility Statement for the full list of supported assistive technology features, including a persisted high-contrast mode and reduced-motion support.",
  },
];

export default function FaqPage() {
  return (
    <StaticPageLayout title="Frequently asked questions">
      {FAQS.map((item) => (
        <div key={item.q}>
          <h2>{item.q}</h2>
          <p>{item.a}</p>
        </div>
      ))}
      <p>
        Still stuck? <a href="/contact">Contact us</a> or open a support
        ticket from inside your account.
      </p>
    </StaticPageLayout>
  );
}

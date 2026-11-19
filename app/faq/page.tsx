import { StaticPageLayout } from "@/components/StaticPageLayout";
import { getSettingInts } from "@/lib/settings";
import { SHIPPING_FEE } from "@/lib/pricing/constants";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Help & FAQ" };

/** FAQ (N-26): answers that match how the shop works; numbers come from Settings. */
export default async function FaqPage() {
  const s = await getSettingInts({ return_window_days: 7, pwd_review_target_days: 2 });
  const FAQS: { q: string; a: React.ReactNode }[] = [
    {
      q: "Who sells here?",
      a: `PWD trainees and graduates of ${SITE.operator}. Sellers verify their PWD ID with AVRC staff, and every listing is reviewed by an administrator before buyers see it.`,
    },
    {
      q: "How do I pay?",
      a: "Cash on delivery, or online with GCash, Maya, GrabPay or a card. Online payments go through PayMongo's secure page; we never see your card or e-wallet details.",
    },
    {
      q: "How much is delivery?",
      a: `₱${SHIPPING_FEE} per seller. Each seller ships their own items, so an order from two sellers is two parcels and two delivery fees. The total is shown before you pay.`,
    },
    {
      q: "How do I track my order?",
      a: "Open My orders. Each order shows its steps — placed, being prepared, shipped, delivered — with the date of each, and the courier and tracking number once the seller adds them.",
    },
    {
      q: "Can I cancel or return an order?",
      a: `You can cancel while the seller has not shipped it yet. After delivery you have ${s.return_window_days} days to ask for a return from the order page. The seller approves it; if you disagree, an administrator decides. Refunds for online payments are sent back through PayMongo.`,
    },
    {
      q: "Do PWD buyers get a discount?",
      a: "Only on items where a discount rule applies, and only after your PWD ID is verified (Account → PWD verification). The cart and checkout show each discount and its legal basis. Many handmade items are not covered by the statutory 20% discount, so not every item has one.",
    },
    {
      q: "How long does PWD verification take?",
      a: `Usually ${s.pwd_review_target_days} working days. You will get a notification and an email with the result. If your ID is not accepted, we tell you why and you can try again.`,
    },
    {
      q: "Can I message a seller before buying?",
      a: "Yes — use “Message seller” on the product page. For problems with an order or your account, open a help request instead; it goes to the InclusiveMarket team.",
    },
    {
      q: "How do I save items for later?",
      a: "Tap the heart on a product. Saved items are in your Wishlist, and you get a notification when one goes on sale.",
    },
    {
      q: "Who sees my personal data?",
      a: (
        <>
          A seller sees your shortened name, delivery address and phone for orders they ship — not your email. The{" "}
          <a href="/privacy">Privacy Policy</a> explains everything we collect and how to ask for a copy or deletion.
        </>
      ),
    },
    {
      q: "Can I use the shop with a screen reader, keyboard or larger text?",
      a: (
        <>
          Yes. Open the accessibility button (bottom corner) to enlarge text up to twice its size, turn on high
          contrast, reduce motion or have pages read aloud. The <a href="/accessibility">accessibility statement</a>{" "}
          lists what works and known problems.
        </>
      ),
    },
  ];

  return (
    <StaticPageLayout title="Help & FAQ">
      {FAQS.map((item) => (
        <section key={item.q}>
          <h2>{item.q}</h2>
          <p>{item.a}</p>
        </section>
      ))}
      <p>
        Still stuck? <a href="/contact">Contact us</a>, or open a help request from your account.
      </p>
    </StaticPageLayout>
  );
}

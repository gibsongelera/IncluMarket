import { StaticPageLayout } from "@/components/StaticPageLayout";
import { UnsubscribeButton } from "@/components/UnsubscribeButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe", robots: { index: false } };

/** The newsletter's unsubscribe link lands here (C-42). */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <StaticPageLayout title="Unsubscribe from the newsletter">
      {token ? (
        <>
          <p>Stop receiving InclusiveMarket newsletter emails? Order receipts and account notices still arrive.</p>
          <UnsubscribeButton token={token} />
        </>
      ) : (
        <p>This link is missing its code. Use the unsubscribe link in the newsletter email, or sign in and turn it off in Account → Privacy.</p>
      )}
    </StaticPageLayout>
  );
}

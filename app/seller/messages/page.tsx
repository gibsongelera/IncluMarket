import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MessagesClient } from "@/components/MessagesClient";
import { getConversationsForUser, getMessagesForConversations, getProfiles } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SellerMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const session = await requireRole(["seller"]);
  const sp = await searchParams;
  const [conversations, profiles] = await Promise.all([
    getConversationsForUser(session.user_id, "seller"),
    getProfiles(),
  ]);
  const messages = await getMessagesForConversations(conversations.map((c) => c.id));

  return (
    <>
      <SiteHeader variant="seller" active="messages" session={session} />
      <main id="main" tabIndex={-1} className="container main--messages">
        <h1>Messages</h1>
        <MessagesClient
          viewerRole="seller"
          viewerId={session.user_id}
          conversations={conversations}
          messages={messages}
          participants={profiles.map((p) => ({ id: p.id, name: p.name }))}
          initialConversationId={sp.c ? Number(sp.c) : null}
        />
      </main>
      <SiteFooter />
    </>
  );
}

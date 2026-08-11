import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MessagesClient } from "@/components/MessagesClient";
import { getConversationsForUser, getMessagesForConversations, getProfiles } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function BuyerMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const session = await requireRole(["buyer"]);
  const sp = await searchParams;
  const [conversations, profiles] = await Promise.all([
    getConversationsForUser(session.user_id, "buyer"),
    getProfiles(),
  ]);
  const messages = await getMessagesForConversations(conversations.map((c) => c.id));

  return (
    <>
      <SiteHeader variant="buyer" active="messages" session={session} />
      <main id="main" tabIndex={-1} className="container main--messages">
        <h1>Messages</h1>
        <MessagesClient
          viewerRole="buyer"
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

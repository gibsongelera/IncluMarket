import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MessagesClient } from "@/components/MessagesClient";
import { getConversationsForUser, getDisplayNames, getMessagesForConversations } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function BuyerMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const session = await requireRole(["buyer"]);
  const sp = await searchParams;
  const conversations = await getConversationsForUser(session.user_id, "buyer");
  // Names of the people in these conversations only — this page used to send
  // every user's name to the browser.
  const [messages, names] = await Promise.all([
    getMessagesForConversations(conversations.map((c) => c.id)),
    getDisplayNames(conversations.map((c) => c.seller_id)),
  ]);

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
          participants={Object.entries(names).map(([id, name]) => ({ id: Number(id), name }))}
          initialConversationId={sp.c ? Number(sp.c) : null}
        />
      </main>
      <SiteFooter />
    </>
  );
}

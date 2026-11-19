import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SupportClient } from "@/components/SupportClient";
import { getTicketResponsesForTickets, getTicketsForUser } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const session = await requireRole(["buyer"]);
  const tickets = await getTicketsForUser(session.user_id);
  const responses = await getTicketResponsesForTickets(tickets.map((t) => t.id));

  return (
    <>
      <SiteHeader variant="buyer" active="support" session={session} />
      <main id="main" tabIndex={-1} className="container main--support">
        <h1>Help &amp; support</h1>
        <SupportClient
          tickets={tickets}
          responses={responses}
        />
      </main>
      <SiteFooter />
    </>
  );
}

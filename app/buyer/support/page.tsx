import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SupportClient } from "@/components/SupportClient";
import { getTicketResponses, getTicketsForUser } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const session = await requireRole(["buyer"]);
  const [tickets, responses] = await Promise.all([
    getTicketsForUser(session.user_id),
    getTicketResponses(),
  ]);
  const ticketIds = new Set(tickets.map((t) => t.id));

  return (
    <>
      <SiteHeader variant="buyer" active="support" session={session} />
      <main id="main" tabIndex={-1} className="container main--support">
        <h1>Help &amp; support</h1>
        <SupportClient
          tickets={tickets}
          responses={responses.filter((r) => ticketIds.has(r.ticket_id))}
        />
      </main>
      <SiteFooter />
    </>
  );
}

import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AdminTicketsClient } from "@/components/AdminTicketsClient";
import { getProfiles, getTicketResponses, getTickets } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminTicketsPage() {
  const session = await requireRole(["admin"]);
  const [tickets, responses, profiles] = await Promise.all([
    getTickets(),
    getTicketResponses(),
    getProfiles(),
  ]);

  return (
    <>
      <SiteHeader variant="admin" active="tickets" session={session} />
      <main id="main" tabIndex={-1} className="container main--admin">
        <h1>Support ticket resolution</h1>
        <AdminTicketsClient
          tickets={tickets}
          responses={responses}
          users={profiles.map((p) => ({ id: p.id, name: p.name, email: p.email }))}
        />
      </main>
      <SiteFooter />
    </>
  );
}

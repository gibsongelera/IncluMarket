import { requireRole } from "@/lib/session";
import { SupportClient } from "@/components/SupportClient";
import { getTicketResponsesForTickets, getTicketsForUser } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Help and support" };

/** Sellers could not open a support request at all (N-16); same form as buyers. */
export default async function SellerSupportPage() {
  const session = await requireRole(["seller"]);
  const tickets = await getTicketsForUser(session.user_id);
  const responses = await getTicketResponsesForTickets(tickets.map((t) => t.id));
  return (
    <main id="main" tabIndex={-1} className="main--seller">
      <h1>Help and support</h1>
      <SupportClient tickets={tickets} responses={responses} />
    </main>
  );
}

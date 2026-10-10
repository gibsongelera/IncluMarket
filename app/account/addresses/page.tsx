import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { getAddresses } from "@/lib/data";
import { AddressBook } from "@/components/AddressBook";

export const dynamic = "force-dynamic";
export const metadata = { title: "Delivery addresses" };

export default async function AddressesPage() {
  const session = await requireRole([]);
  if (session.role !== "buyer") redirect("/account");
  const addresses = await getAddresses(session.user_id);
  return (
    <>
      <h1>Delivery addresses</h1>
      <p className="lede">Choose one at checkout instead of typing it each time.</p>
      <AddressBook addresses={addresses ?? []} available={addresses !== null} />
    </>
  );
}

import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getMyVerification } from "@/lib/pwd/data";
import { VerificationStatus } from "@/components/VerificationStatus";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your account" };

const ROLE_LABEL = { buyer: "Buyer", seller: "Seller", admin: "Administrator" } as const;

export default async function AccountPage() {
  const session = await requireRole([]);
  const my = session.role === "admin" ? null : await getMyVerification(session.user_id);

  return (
    <>
      <h1>Your account</h1>
      <div className="account-grid">
        <section className="card" aria-labelledby="acct-details">
          <h2 id="acct-details">Account details</h2>
          <dl className="details-list">
            <dt>Name</dt>
            <dd>{session.name}</dd>
            <dt>Email</dt>
            <dd>{session.email}</dd> {/* props-ok: the signed-in user reading their own address */}
            <dt>Account type</dt>
            <dd>{ROLE_LABEL[session.role]}</dd>
          </dl>
        </section>

        {my && session.role !== "admin" ? (
          <VerificationStatus my={my} role={session.role} compact />
        ) : (
          <section className="card" aria-labelledby="acct-admin">
            <h2 id="acct-admin">PWD verification</h2>
            <p>You review PWD IDs rather than submit one.</p>
            <p>
              <Link href="/admin/users" className="btn btn--outline btn--sm">
                Go to the admin console
              </Link>
            </p>
          </section>
        )}
      </div>
    </>
  );
}

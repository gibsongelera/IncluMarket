import Link from "next/link";
import { requireRole } from "@/lib/session";
import { pwdHashConfigured } from "@/lib/pwd/crypto";
import { SellerSetupForm } from "@/components/SellerSetupForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up a seller" };

/**
 * Admin → Users → Set up a seller: AVRC staff make a PWD trainee's seller
 * account from the person's details and their PWD ID card, seen in person
 * (lib/actions/admin-sellers.ts). The ID counts as verified, the shop is
 * named, and the person gets an email to choose their own password.
 */
export default async function NewSellerPage() {
  await requireRole(["admin"]);
  const canRecordIds = pwdHashConfigured();

  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/admin/users">Users</Link> <span aria-hidden="true">/</span> Set up a seller
      </nav>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Set up a PWD seller</h1>
          <p className="muted">
            For a trainee whom AVRC staff know in person. Enter their details and copy the details from their PWD ID
            card. We email them a link to choose their own password: no administrator sets it or sees it. Their PWD ID
            counts as verified, so they can list products as soon as they sign in.
          </p>
        </div>
      </div>

      {canRecordIds ? null : (
        <p className="notice notice--warning">
          PWD ID numbers cannot be recorded on this server because <code>PWD_ID_HASH_KEY</code> is not set. Add it in
          the hosting settings, then set up the seller.
        </p>
      )}

      <SellerSetupForm canSubmit={canRecordIds} />
    </main>
  );
}

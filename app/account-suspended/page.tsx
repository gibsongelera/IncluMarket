import Link from "next/link";
import { StaticPageLayout } from "@/components/StaticPageLayout";
import { logoutAction } from "@/lib/actions/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account suspended — IncluMarket" };

// Where requireRole() sends a signed-in user whose account an administrator
// has suspended. Before, they were redirected to the storefront with no
// explanation at all (B-14).
export default function AccountSuspendedPage() {
  return (
    <StaticPageLayout title="Your account is suspended">
      <p>
        An administrator has suspended this account, so you cannot use your
        cart, orders or shop for now. We sent the reason to your email
        address.
      </p>
      <p>
        If you think this is a mistake, <Link href="/contact">contact us</Link> and
        tell us the email address of your account. You can still browse the
        shop without signing in.
      </p>
      <form action={logoutAction}>
        <button type="submit" className="btn btn--primary">
          Sign out
        </button>
      </form>
    </StaticPageLayout>
  );
}

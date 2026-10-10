import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ConsoleNav } from "@/components/ConsoleNav";

export const dynamic = "force-dynamic";

/**
 * Admin console shell: header, a left sidebar from 1024px up, the footer.
 * Each page renders only its own <main> and repeats the admin check.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["admin"]);
  return (
    <>
      <SiteHeader variant="admin" session={session} />
      <div className="container console">
        <ConsoleNav variant="admin" />
        <div className="console__content">{children}</div>
      </div>
      <SiteFooter />
    </>
  );
}

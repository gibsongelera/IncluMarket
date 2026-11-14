import { Suspense } from "react";
import { requireRole } from "@/lib/session";
import { getAdminBadges } from "@/lib/admin-overview";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ConsoleNav } from "@/components/ConsoleNav";

export const dynamic = "force-dynamic";

/**
 * Admin console shell: header, a left sidebar from 1024px up, the footer.
 * Each page renders only its own <main> and repeats the admin check.
 *
 * The sidebar's badges are the overview's to-do counts (03 §3), read once
 * per request with the page through getAdminTodo()'s React cache. They
 * stream in their own Suspense boundary: awaited here, the nine counts held
 * up the page below them (about 160 ms at p50 and 265 ms at p95 on
 * /admin/orders in dev, against the plan's 150 ms limit); streamed, the page
 * renders alongside them and the sidebar draws at once, its badges filling
 * in when the counts arrive.
 *
 * They refresh with the layout: on a full load, and after an action that
 * calls router.refresh(). A plain soft navigation between admin pages keeps
 * the layout, so a count changed meanwhile by someone else shows on the next
 * of those.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["admin"]);
  return (
    <>
      <SiteHeader variant="admin" session={session} />
      <div className="container console">
        <Suspense fallback={<ConsoleNav variant="admin" />}>
          <AdminNav />
        </Suspense>
        <div className="console__content">{children}</div>
      </div>
      <SiteFooter />
    </>
  );
}

/** The sidebar with its badges, once the counts are in. */
async function AdminNav() {
  const badges = await getAdminBadges();
  return <ConsoleNav variant="admin" badges={badges} />;
}

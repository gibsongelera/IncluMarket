import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getAdminVerificationData, type AdminVerificationView } from "@/lib/pwd/admin-data";
import { AdminVerificationsClient } from "@/components/AdminVerificationsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "PWD verifications" };

const VIEWS: { id: AdminVerificationView; label: string }[] = [
  { id: "queue", label: "To review" },
  { id: "decided", label: "Decided" },
  { id: "sellers", label: "Unverified sellers" },
  { id: "flags", label: "Flags" },
];

export default async function AdminVerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requireRole(["admin"]);
  const { view: raw } = await searchParams;
  const view = (VIEWS.find((v) => v.id === raw)?.id ?? "queue") as AdminVerificationView;
  const data = await getAdminVerificationData(view);

  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <h1>PWD verifications</h1>
      {!data.available ? (
        <p className="notice notice--info" role="status">
          PWD verification needs database migration 0017. Apply it, then this queue fills as people send their IDs.
        </p>
      ) : (
        <>
          <nav className="tabs" aria-label="Verification lists">
            {VIEWS.map((v) => {
              const count = v.id === "decided" ? null : data.counts[v.id];
              const current = v.id === view;
              return (
                <Link
                  key={v.id}
                  href={v.id === "queue" ? "/admin/verifications" : `/admin/verifications?view=${v.id}`}
                  className={`tab${current ? " tab--active" : ""}`}
                  aria-current={current ? "page" : undefined}
                >
                  {v.label}
                  {count ? <span className="tab__count"> ({count})</span> : null}
                </Link>
              );
            })}
          </nav>
          <AdminVerificationsClient view={view} rows={data.rows} sellers={data.sellers} flags={data.flags} />
        </>
      )}
    </main>
  );
}

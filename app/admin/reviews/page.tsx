import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getAdminReviews, type AdminReviewView } from "@/lib/admin-content";
import { AdminReviewsClient } from "@/components/AdminReviewsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reviews" };

const VIEWS: { id: AdminReviewView; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "low", label: "1–2 stars" },
  { id: "hidden", label: "Hidden" },
];

/** Admin → Reviews (C-40): hide a review with a reason, or show it again. */
export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireRole(["admin"]);
  const raw = (await searchParams).view;
  const view = VIEWS.find((v) => v.id === raw)?.id ?? "recent";
  const reviews = await getAdminReviews(view);
  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <h1>Reviews</h1>
      <p className="muted">
        Hide a review only when it breaks the rules — abuse, personal details, spam, or nothing to do with the product.
        A low rating on its own is not a reason. The reviewer is told why, and a hidden review no longer counts toward
        the product&rsquo;s rating.
      </p>
      <nav className="tabs" aria-label="Review lists">
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            href={v.id === "recent" ? "/admin/reviews" : `/admin/reviews?view=${v.id}`}
            className={`tab${v.id === view ? " tab--active" : ""}`}
            aria-current={v.id === view ? "page" : undefined}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      {reviews === null ? (
        <p className="notice notice--info">Hiding reviews needs database migration 0019.</p>
      ) : (
        <AdminReviewsClient reviews={reviews} />
      )}
    </main>
  );
}

import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SearchBox } from "@/components/SearchBox";
import { getRenderSession } from "@/lib/session";
import { getCategories } from "@/lib/data";
import type { Category } from "@/lib/types";

export const metadata = { title: "Page not found" };

/**
 * The 404. Unknown URLs used to get Next.js's unstyled black page, and a
 * missing product answered HTTP 200 with "Product not found" (B-18, N-15).
 * notFound() now lands here: a plain explanation, a search box, popular
 * categories and a way home — never a dead end.
 */
export default async function NotFound() {
  const session = await getRenderSession().catch(() => null);
  let categories: Category[] = [];
  try {
    categories = (await getCategories()).slice(0, 8);
  } catch {
    categories = [];
  }

  return (
    <>
      <SiteHeader variant={session?.role ?? "buyer"} session={session} />
      <main id="main" tabIndex={-1} className="container page-state">
        <h1>We can&apos;t find that page</h1>
        <p>
          The link may be old, or the item may no longer be for sale. Try searching, or browse a
          category below.
        </p>
        <div className="page-state__search">
          <SearchBox idBase="nf-search" />
        </div>
        {categories.length ? (
          <nav aria-labelledby="nf-cats">
            <h2 id="nf-cats" className="page-state__subtitle">
              Popular categories
            </h2>
            <ul className="page-state__links">
              {categories.map((c) => (
                <li key={c.id}>
                  <Link className="btn btn--ghost btn--sm" href={`/home?cat=${encodeURIComponent(c.id)}`}>
                    {c.folder || c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        <p>
          <Link href="/home" className="btn btn--primary">
            Go to the shop
          </Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}

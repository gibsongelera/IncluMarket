import { requireRole } from "@/lib/session";
import { listHref, missingHint, parseListParams, type ListParams, type RawParams } from "@/lib/list-params";
import { PRODUCT_TABS, getAdminProductList, productTab, type ProductTab } from "@/lib/admin-lists";
import { AdminProductsClient, type ProductsEmpty } from "@/components/AdminProductsClient";
import { ListToolbar } from "@/components/ListToolbar";
import { Pagination } from "@/components/Pagination";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

const PATH = "/admin/products";

/** What an empty list says, and the way out of it: clear the search, or another tab. */
function emptyState(tab: ProductTab, shown: ListParams): ProductsEmpty {
  if (shown.q) {
    return { text: `No listings match “${shown.q}”.`, href: listHref(PATH, shown, { q: null }), action: "Clear search" };
  }
  switch (tab) {
    case "pending":
      return { text: "Nothing is waiting for review.", href: listHref(PATH, shown, { status: "all" }), action: "See all listings" };
    case "approved":
      return { text: "No approved listings yet." };
    case "flagged":
      // No ?status: the review queue is the default tab.
      return { text: "No listings are waiting on their seller.", href: listHref(PATH, shown, { status: null }), action: "See the review queue" };
    default:
      return { text: "No listings yet." };
  }
}

/**
 * Admin → Products (C-39, P2-08, 03 §6): the verification queue and every
 * listing, one page at a time, with a tab per status (?status=, as the
 * overview's tiles and the dashboard search send), search by listing number,
 * title or seller, and the row's review and feature actions.
 * lib/admin-lists.ts reads the page and the tab counts.
 */
export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requireRole(["admin"]);
  const params = parseListParams(await searchParams);
  const tab = productTab(params.filters.status);
  const list = await getAdminProductList(params, tab);
  // The page actually shown (clamped past the end, or the one holding
  // ?focus=), and its tab always explicit: every tab has a value, so with
  // no ?status the queue is "pending", and ?status=archived shows "all".
  const shown: ListParams = { ...params, page: list.page, filters: { ...params.filters, status: tab } };

  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Products</h1>
          <p className="muted">The verification queue, and every listing in the shop</p>
        </div>
      </div>

      <ListToolbar
        path={PATH}
        params={shown}
        tabs={PRODUCT_TABS.map((t) => ({ value: t.value, label: t.label, count: list.counts[t.value] }))}
        tabParam="status"
        search={{ label: "Search listings", placeholder: "Listing number, title or seller" }}
        exportHref="/admin/reports#report-products"
        exportLabel="Products report"
        total={list.total}
        noun={["listing", "listings"]}
      />

      {list.capped || list.focusMissing || list.degraded.featureWindow || list.degraded.moderationReason ? (
        <div className="list-notes">
          {list.capped ? <p>Many listings or sellers match that, so some may be missing. Add more words to narrow it.</p> : null}
          {list.focusMissing ? (
            // A link meant one listing and it is not here: say so where focus
            // lands (DeepLinkFocus moves it to data-focus-missing).
            <p className="notice notice--warning" tabIndex={-1} data-focus-missing>
              Listing #{params.focus} is not in this list.{missingHint(tab !== "all", Boolean(params.q), "All")}
            </p>
          ) : null}
          {list.degraded.featureWindow ? (
            <p>Feature places and dates need database update 0021; a feature saved now has no window.</p>
          ) : null}
          {list.degraded.moderationReason ? <p>The reason a listing was sent back needs database update 0016.</p> : null}
        </div>
      ) : null}

      <AdminProductsClient rows={list.rows} empty={emptyState(tab, shown)} />
      <Pagination path={PATH} params={shown} total={list.total} label="Listing pages" />
    </main>
  );
}

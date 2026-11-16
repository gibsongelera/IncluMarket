import { requireRole } from "@/lib/session";
import { listHref, missingHint, parseListParams, type ListParams, type RawParams } from "@/lib/list-params";
import { getSellerOrderList } from "@/lib/seller-lists";
import {
  SELLER_ORDER_EMPTY,
  SELLER_ORDER_TABS,
  sellerOrderTab,
  type SellerOrderTab,
  type SellerOrdersEmpty,
} from "@/lib/seller-list-types";
import { SellerOrdersClient } from "@/components/SellerOrdersClient";
import { ListToolbar } from "@/components/ListToolbar";
import { Pagination } from "@/components/Pagination";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders" };

const PATH = "/seller/orders";

/** What an empty list says, and the way out of it: clear the search, or back to All. */
function emptyState(tab: SellerOrderTab, shown: ListParams, degraded: boolean): SellerOrdersEmpty {
  if (degraded) return { text: "Your orders will show here once the database is updated." };
  if (shown.q) {
    return { text: `No orders match “${shown.q}”.`, href: listHref(PATH, shown, { q: null }), action: "Clear search" };
  }
  if (tab === "all") return { text: SELLER_ORDER_EMPTY.all };
  return { text: SELLER_ORDER_EMPTY[tab], href: PATH, action: "See all orders" };
}

/**
 * Seller Centre → Orders (P3-05, 04 §6): this seller's orders one page at a
 * time, with a tab per status (?status=, as the dashboard's to-do tiles and
 * donut link), search by order number or buyer name, and each order's steps
 * in its row's Actions. lib/seller-lists.ts reads the page and the counts,
 * scoped to the session's seller.
 */
export default async function SellerOrdersPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requireRole(["seller"]);
  const params = parseListParams(await searchParams);
  const tab = sellerOrderTab(params.filters.status);
  const list = await getSellerOrderList(params, tab);
  // The page actually shown: clamped past the end, or the one holding ?focus=.
  const shown = { ...params, page: list.page };

  return (
    <main id="main" tabIndex={-1} className="main--seller">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Orders</h1>
          <p className="muted">Accept, pack and ship your orders, and answer return requests</p>
        </div>
      </div>

      <ListToolbar
        path={PATH}
        params={shown}
        tabs={SELLER_ORDER_TABS.map((t) => ({
          value: t.value === "all" ? null : t.value,
          label: t.label,
          count: list.counts[t.value],
        }))}
        tabParam="status"
        search={{ label: "Search orders", placeholder: "Order number or buyer name" }}
        total={list.total}
        noun={["order", "orders"]}
      />

      {list.focusMissing || list.degraded ? (
        <div className="list-notes">
          {list.focusMissing ? (
            // A link meant one order and it is not here: say so where focus
            // lands (DeepLinkFocus moves it to data-focus-missing).
            <p className="notice notice--warning" tabIndex={-1} data-focus-missing>
              Order #{params.focus} is not in this list.{missingHint(tab !== "all", Boolean(params.q), "All")}
            </p>
          ) : null}
          {list.degraded ? (
            <p>This list needs database migration 0015, which records the shop of each order.</p>
          ) : null}
        </div>
      ) : null}

      <SellerOrdersClient rows={list.rows} empty={emptyState(tab, shown, list.degraded)} />
      <Pagination path={PATH} params={shown} total={list.total} label="Order pages" />
    </main>
  );
}

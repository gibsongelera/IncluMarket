import { requireRole } from "@/lib/session";
import { listHref, parseListParams, type ListParams, type RawParams } from "@/lib/list-params";
import { ORDER_VIEWS, getAdminOrderList, orderView, type OrderView } from "@/lib/admin-lists";
import { AdminOrdersClient, type OrdersEmpty } from "@/components/AdminOrdersClient";
import { ListToolbar } from "@/components/ListToolbar";
import { Pagination } from "@/components/Pagination";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders" };

const PATH = "/admin/orders";

const EMPTY_VIEW: Record<OrderView, string> = {
  all: "No orders yet. They appear here when a buyer checks out.",
  open: "No orders are in progress.",
  returns: "No return requests are open.",
  refunds: "No refunds are due.",
  cancelled: "No orders have been cancelled.",
};

/** What an empty list says, and the way out of it: clear the search, or back to Recent. */
function emptyState(view: OrderView, shown: ListParams): OrdersEmpty {
  if (shown.q) {
    return { text: `No orders match “${shown.q}”.`, href: listHref(PATH, shown, { q: null }), action: "Clear search" };
  }
  if (view === "all") return { text: EMPTY_VIEW.all };
  return { text: EMPTY_VIEW[view], href: PATH, action: "See recent orders" };
}

/**
 * Admin → Orders (C-40, P2-07, 03 §6): every order one page at a time, with
 * a tab per view (?view=, as the overview's Needs attention links send),
 * search by order number or by buyer or shop name, and the row's support
 * actions. lib/admin-lists.ts reads the page and the tab counts.
 */
export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requireRole(["admin"]);
  const params = parseListParams(await searchParams);
  const view = orderView(params.filters.view);
  const list = await getAdminOrderList(params, view);
  // The page actually shown: clamped past the end, or the one holding ?focus=.
  const shown = { ...params, page: list.page };

  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Orders</h1>
          <p className="muted">Every order, and the ones that need you: returns, refunds and cancellations</p>
        </div>
      </div>

      <ListToolbar
        path={PATH}
        params={shown}
        tabs={ORDER_VIEWS.map((v) => ({
          value: v.value === "all" ? null : v.value,
          label: v.label,
          count: list.counts[v.value],
        }))}
        tabParam="view"
        search={{ label: "Search orders", placeholder: "Order number, buyer or shop" }}
        exportHref="/admin/reports#report-orders"
        exportLabel="Orders report"
        total={list.total}
        noun={["order", "orders"]}
      />

      {view === "returns" || list.capped || list.focusMissing || list.degraded ? (
        <div className="list-notes">
          {view === "returns" ? (
            <p>Every open return request; the Overview counts those waiting over a day.</p>
          ) : null}
          {list.capped ? (
            <p>
              Many people match that name, so some of their orders may be missing. Add more of the name to narrow
              it.
            </p>
          ) : null}
          {list.focusMissing ? (
            // A link meant one order and it is not here: say so where focus
            // lands (DeepLinkFocus moves it to data-focus-missing), not only
            // in a muted line a screen reader would never reach.
            <p className="notice notice--warning" tabIndex={-1} data-focus-missing>
              Order #{params.focus} is not in this list. Try the Recent tab or clear the search.
            </p>
          ) : null}
          {list.degraded ? <p>Refunds and shops need database update 0014/0015.</p> : null}
        </div>
      ) : null}

      <AdminOrdersClient rows={list.rows} empty={emptyState(view, shown)} />
      <Pagination path={PATH} params={shown} total={list.total} label="Order pages" />
    </main>
  );
}

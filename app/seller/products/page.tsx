import { requireRole } from "@/lib/session";
import { getAllCategories } from "@/lib/data";
import { listHref, missingHint, parseListParams, type ListParams, type RawParams } from "@/lib/list-params";
import { getSellerProductList } from "@/lib/seller-lists";
import {
  SELLER_PRODUCT_EMPTY,
  SELLER_PRODUCT_TABS,
  sellerProductTab,
  type SellerProductTab,
  type SellerProductsEmpty,
} from "@/lib/seller-list-types";
import { SellerProductsClient } from "@/components/SellerProductsClient";
import { ListToolbar } from "@/components/ListToolbar";
import { Pagination } from "@/components/Pagination";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

const PATH = "/seller/products";

/** What an empty list says, and the way out of it: clear the search, back to All, or add a first product. */
function emptyState(tab: SellerProductTab, shown: ListParams, degraded: boolean): SellerProductsEmpty {
  if (tab === "archived" && degraded) {
    return { text: "Unpublished products will show here once the database is updated.", href: PATH, action: "See all products" };
  }
  if (shown.q) {
    return { text: `No products match “${shown.q}”.`, href: listHref(PATH, shown, { q: null }), action: "Clear search" };
  }
  if (tab === "all") return { text: SELLER_PRODUCT_EMPTY.all, addProduct: true };
  return { text: SELLER_PRODUCT_EMPTY[tab], href: PATH, action: "See all products" };
}

/**
 * Seller Centre → Products (P3-06, 04 §6): this seller's products one page
 * at a time, with a tab per status in the seller's words (?status= takes
 * the raw values; the dashboard's "listings needing changes" links
 * ?status=flagged), search by name or listing number, ?focus= from the
 * dashboard's Best sellers and Running low, and each product's Edit…,
 * Duplicate, Flash sale… and Unpublish in its row's Actions. ?new=1 opens
 * the wizard (P3-03). lib/seller-lists.ts reads the page and the counts,
 * scoped to the session's seller.
 */
export default async function SellerProductsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requireRole(["seller"]);
  const params = parseListParams(await searchParams);
  const tab = sellerProductTab(params.filters.status);
  // The wizard's category list, needed with no rows too (Add a product).
  const [list, categories] = await Promise.all([getSellerProductList(params, tab), getAllCategories()]);
  // The page actually shown: clamped past the end, or the one holding ?focus=.
  const shown = { ...params, page: list.page };

  const toolbar = (
    <>
      <ListToolbar
        path={PATH}
        params={shown}
        tabs={SELLER_PRODUCT_TABS.map((t) => ({
          value: t.value === "all" ? null : t.value,
          label: t.label,
          count: list.counts[t.value],
        }))}
        tabParam="status"
        search={{ label: "Search products", placeholder: "Product name or number" }}
        total={list.total}
        noun={["product", "products"]}
      />

      {list.capped || list.focusMissing || list.degraded ? (
        <div className="list-notes">
          {list.capped ? (
            <p>Many of your products match, so some may be missing. Add more words to narrow the search.</p>
          ) : null}
          {list.focusMissing ? (
            // A link meant one product and it is not here: say so where
            // focus lands (DeepLinkFocus moves it to data-focus-missing).
            <p className="notice notice--warning" tabIndex={-1} data-focus-missing>
              Product #{params.focus} is not in this list.{missingHint(tab !== "all", Boolean(params.q), "All")}
            </p>
          ) : null}
          {list.degraded ? (
            <p>
              The Unpublished tab needs database migration 0016, which adds unpublishing. Until then it has no
              count and lists nothing.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );

  return (
    <main id="main" tabIndex={-1} className="main--seller">
      <SellerProductsClient
        products={list.products}
        variants={list.variants}
        categories={categories}
        empty={emptyState(tab, shown, list.degraded)}
        toolbar={toolbar}
      />
      <Pagination path={PATH} params={shown} total={list.total} label="Product pages" />
    </main>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Pill } from "./Pill";
import { money, formatDate, productImageSrc } from "@/lib/format";
import { toast } from "@/lib/toast";
import { setProductPublished, createFlashSale, duplicateProduct } from "@/lib/actions/seller";
import { ProductWizard } from "./ProductWizard";
import type { Category, Product, ProductVariant } from "@/lib/types";
import { LOW_STOCK_MAX } from "@/lib/analytics/seller";
import { photoWords, productStatusWords, stockWords, type SellerProductsEmpty } from "@/lib/seller-list-types";
import { TableWrap } from "./TableWrap";
import { DeepLinkFocus } from "./DeepLinkFocus";
import { RowActions } from "./RowActions";
import { useRowFocus } from "./useRowFocus";

/**
 * Seller Centre → Products (P3-06, 04 §6): one page of this seller's
 * products, already filtered, searched and paged on the server
 * (lib/seller-lists.ts), with each product's Edit…, Duplicate, Flash sale…
 * and Unpublish / Republish in its row's Actions. The wizard (C-32) and the
 * flash-sale dialog are the same as before. `toolbar` is the page's
 * ListToolbar and its notes, rendered on the server, between the page head
 * (whose Add a product button opens the wizard here) and the table.
 */
export function SellerProductsClient({
  products,
  variants,
  categories,
  empty,
  toolbar,
}: {
  products: Product[];
  variants: ProductVariant[];
  categories: Category[];
  empty: SellerProductsEmpty;
  toolbar?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const flashDialogRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  // Opened by ?new=1, not by a click: on close there is no button to send
  // focus back to, so it goes to "Add a product".
  const openedByLink = useRef(false);
  // An action already on its way: the row's buttons do nothing until it
  // lands. Not `disabled`: disabling the focused button would drop focus to
  // <body>.
  const inFlight = useRef(false);

  // Where focus goes when an action takes the product off this tab
  // (Unpublish on On sale, Republish on Unpublished, an edit that sends an
  // approved product back to review).
  const focus = useRowFocus(products);

  // ?new=1 (the dashboard's "Add a product", P3-03) opens the existing
  // wizard, then comes off the URL, so Back, a reload or a shared link does
  // not open it again. The other parameters stay.
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    openedByLink.current = true;
    setEditing("new");
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete("new");
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [searchParams, pathname, router]);

  function closeWizard() {
    setEditing(null);
    if (openedByLink.current) {
      openedByLink.current = false;
      requestAnimationFrame(() => document.getElementById("add-product")?.focus());
    }
  }
  const [flashProductId, setFlashProductId] = useState<number | null>(null);
  const [flashDiscount, setFlashDiscount] = useState(20);
  const [flashHours, setFlashHours] = useState(24);
  const [flashBusy, setFlashBusy] = useState(false);
  const [flashStart, setFlashStart] = useState("");

  function openWizard(p: Product | "new") {
    if (inFlight.current) return;
    // The wizard saves on its own and refreshes the page, so the rows can
    // land while it is still open: mark now (an approved product sent back
    // to review leaves the On sale tab, and its Edit… with it).
    if (p !== "new") focus.mark(p.id);
    setEditing(p);
  }

  function cancelWizard() {
    focus.clear();
    closeWizard();
  }

  async function duplicate(p: Product) {
    if (inFlight.current) return;
    inFlight.current = true;
    // Before the await: the refreshed rows can land before it resolves.
    focus.mark(p.id);
    const res = await duplicateProduct(p.id);
    inFlight.current = false;
    if (!res.ok) {
      focus.clear();
      return toast(res.error || "Could not duplicate.", "error");
    }
    toast(`Copied “${p.title}”. The copy has 0 stock and is waiting for review.`, "success");
    router.refresh();
  }

  const categoryLabel = (id: string | null) =>
    categories.find((c) => c.id === id)?.label || id || "Uncategorized";

  function openFlash(id: number) {
    if (inFlight.current) return;
    setFlashProductId(id);
    setFlashDiscount(20);
    setFlashHours(24);
    setFlashStart("");
    flashDialogRef.current?.showModal();
  }

  async function submitFlash(e: React.MouseEvent) {
    e.preventDefault();
    if (flashProductId == null) return;
    setFlashBusy(true);
    focus.mark(flashProductId);
    const res = await createFlashSale(
      flashProductId,
      flashDiscount,
      flashHours,
      flashStart ? new Date(flashStart).toISOString() : null
    );
    setFlashBusy(false);
    if (!res.ok) {
      focus.clear();
      toast(res.error || "Could not start flash sale.", "error");
      return;
    }
    toast(flashStart ? "Flash sale scheduled. See it under Flash sales." : "Flash sale started.", "success");
    flashDialogRef.current?.close();
    router.refresh();
  }

  async function onPublish(id: number, published: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    // Before the await (Unpublish on On sale takes the row off the tab).
    focus.mark(id);
    const res = await setProductPublished(id, published);
    inFlight.current = false;
    if (!res.ok) {
      focus.clear();
      toast(res.error || "Could not update the listing.", "error");
      return;
    }
    toast(
      published
        ? "Sent for review. It goes back on sale once approved."
        : "Unpublished. Buyers can no longer see it; past orders still show it.",
      "success"
    );
    router.refresh();
  }

  /** Each product's options, for the stock column. */
  const optionsOf = (id: number) => variants.filter((v) => v.product_id === id);

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Products</h1>
          <p className="muted">Add and edit your products, fix what an admin sent back, and run flash sales</p>
        </div>
        <button type="button" className="btn btn--primary" id="add-product" onClick={() => openWizard("new")}>
          Add a product
        </button>
      </div>

      {toolbar}

      {/* DeepLinkFocus stays on an empty list too: it moves focus to the
          page's "not in this list" note when ?focus= names a product that
          is not here. */}
      <DeepLinkFocus />
      {products.length === 0 ? (
        <div className="empty">
          {/* Focus lands on the sentence when an action empties the list:
              it says why, which the link alone would skip. */}
          <p ref={focus.emptyRef} tabIndex={-1}>
            {empty.text}
          </p>
          {empty.addProduct ? (
            <button type="button" className="btn btn--primary" onClick={() => openWizard("new")}>
              Add a product
            </button>
          ) : empty.href && empty.action ? (
            <Link className="btn btn--outline" href={empty.href}>
              {empty.action}
            </Link>
          ) : null}
        </div>
      ) : (
        <TableWrap label="Products">
          <table className="data-table data-table--cards" aria-label="Products, newest first">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Category</th>
                <th scope="col" className="num">
                  Base price
                </th>
                <th scope="col">Status</th>
                <th scope="col">Stock</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const status = p.status || "pending";
                const stock = stockWords(optionsOf(p.id).map((v) => v.stock_qty), LOW_STOCK_MAX);
                const photos = Array.isArray(p.images) ? p.images.length : 0;
                return (
                  <tr key={p.id} data-row-id={p.id}>
                    <td>
                      <div className="cell-identity">
                        {/* The title beside it names the product. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="cell-identity__thumb" src={productImageSrc(p, 0)} alt="" decoding="async" />
                        <span className="cell-identity__text">
                          <span className="cell-identity__name">{p.title}</span>
                          <span className="cell-identity__meta">
                            <span className="cell-code">#{p.id}</span> · {formatDate(p.created_at)} · {photoWords(photos)}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td>{categoryLabel(p.category)}</td>
                    <td className="num">{money(p.base_price)}</td>
                    <td>
                      <Pill status={status} label={productStatusWords(status)} />
                      {status === "flagged" && p.moderation_reason ? (
                        <p className="small muted">Admin note: {p.moderation_reason}</p>
                      ) : null}
                    </td>
                    <td>
                      {stock.text}
                      {stock.low ? <div className="small text-warning">Running low</div> : null}
                    </td>
                    <td className="cell-actions">
                      {/* Each keyed: Unpublish gives way to Republish as a
                          new button, so RowActions moves focus to the
                          toggle instead of leaving it on a button that now
                          does something else. Flash sale… only where it
                          can run (approved). */}
                      <RowActions label={`${p.title} #${p.id}`}>
                        <button key="edit" type="button" className="btn btn--ghost btn--sm" onClick={() => openWizard(p)}>
                          Edit…
                        </button>
                        <button key="duplicate" type="button" className="btn btn--ghost btn--sm" onClick={() => duplicate(p)}>
                          Duplicate
                        </button>
                        {status === "approved" ? (
                          <button key="flash" type="button" className="btn btn--ghost btn--sm" onClick={() => openFlash(p.id)}>
                            Flash sale…
                          </button>
                        ) : null}
                        {status === "archived" ? (
                          <button
                            key="republish"
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => onPublish(p.id, true)}
                          >
                            Republish
                          </button>
                        ) : (
                          <button
                            key="unpublish"
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => onPublish(p.id, false)}
                          >
                            Unpublish
                          </button>
                        )}
                      </RowActions>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      <ProductWizard
        product={editing}
        variants={variants}
        categories={categories}
        onClose={cancelWizard}
        onSaved={() => {
          // A new product: the button that opened the wizard may be the
          // empty state's, which the refreshed list replaces, so focus goes
          // to the page's own "Add a product". An edit was marked on open.
          if (editing === "new") openedByLink.current = true;
          closeWizard();
          router.refresh();
        }}
      />

      <dialog id="flash-modal" className="modal" ref={flashDialogRef} aria-labelledby="flash-title">
        <form method="dialog" className="modal-form" id="flash-form">
          <h2 id="flash-title">Start a flash sale</h2>
          <p className="hint">
            1 hour to 7 days. Buyers who saved this product are told when it starts now; a product can have one sale
            at a time.
          </p>
          <div className="row">
            <div className="field">
              <label htmlFor="flash-discount">Discount (%)</label>
              <input
                id="flash-discount"
                type="number"
                min={1}
                max={90}
                value={flashDiscount}
                onChange={(e) => setFlashDiscount(Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="flash-hours">Duration (hours)</label>
              <input
                id="flash-hours"
                type="number"
                min={1}
                max={168}
                value={flashHours}
                onChange={(e) => setFlashHours(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="flash-start">
              Starts <span className="muted">(optional — empty means now)</span>
            </label>
            <input id="flash-start" type="datetime-local" value={flashStart} onChange={(e) => setFlashStart(e.target.value)} />
          </div>
          <div className="form-actions">
            <button
              value="cancel"
              className="btn btn--ghost"
              onClick={(e) => {
                e.preventDefault();
                flashDialogRef.current?.close();
              }}
            >
              Cancel
            </button>
            <button
              value="submit"
              className="btn btn--primary"
              disabled={flashBusy}
              onClick={submitFlash}
            >
              {flashStart ? "Schedule flash sale" : "Start flash sale"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

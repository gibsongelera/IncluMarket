"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "./Pill";
import { money, formatDate, productImageSrc } from "@/lib/format";
import { toast } from "@/lib/toast";
import { setProductPublished, createFlashSale, duplicateProduct } from "@/lib/actions/seller";
import { ProductWizard } from "./ProductWizard";
import type { Category, Product, ProductVariant } from "@/lib/types";
import { TableWrap } from "./TableWrap";
import { DeepLinkFocus } from "./DeepLinkFocus";

export function SellerProductsClient({
  products,
  variants,
  categories,
}: {
  products: Product[];
  variants: ProductVariant[];
  categories: Category[];
}) {
  const router = useRouter();
  const flashDialogRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [flashProductId, setFlashProductId] = useState<number | null>(null);
  const [flashDiscount, setFlashDiscount] = useState(20);
  const [flashHours, setFlashHours] = useState(24);
  const [flashBusy, setFlashBusy] = useState(false);
  const [flashStart, setFlashStart] = useState("");

  async function duplicate(p: Product) {
    const res = await duplicateProduct(p.id);
    if (!res.ok) return toast(res.error || "Could not duplicate.", "error");
    toast(`Copied “${p.title}”. The copy has 0 stock and is waiting for review.`, "success");
    router.refresh();
  }

  const categoryLabel = (id: string | null) =>
    categories.find((c) => c.id === id)?.label || id || "Uncategorized";

  function openFlash(id: number) {
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
    const res = await createFlashSale(
      flashProductId,
      flashDiscount,
      flashHours,
      flashStart ? new Date(flashStart).toISOString() : null
    );
    setFlashBusy(false);
    if (!res.ok) {
      toast(res.error || "Could not start flash sale.", "error");
      return;
    }
    toast(flashStart ? "Flash sale scheduled. See it under Flash sales." : "Flash sale started.", "success");
    flashDialogRef.current?.close();
    router.refresh();
  }

  async function onPublish(id: number, published: boolean) {
    const res = await setProductPublished(id, published);
    if (!res.ok) {
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

  return (
    <>
      <div className="page-head">
        <h1>Product catalog</h1>
        <button type="button" className="btn btn--primary" id="add-product" onClick={() => setEditing("new")}>
          Add new product
        </button>
      </div>

      <DeepLinkFocus />
      <TableWrap label="My products">
        <table className="data-table data-table--cards" aria-label="My products">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">Category</th>
              <th scope="col">Base price</th>
              <th scope="col">Status</th>
              <th scope="col">Variants</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody id="product-rows">
            {products.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  You have no products yet.
                </td>
              </tr>
            ) : (
              products.map((p) => {
                const vs = variants.filter((v) => v.product_id === p.id);
                const totalStock = vs.reduce((n, v) => n + v.stock_qty, 0);
                const hasPhoto = Array.isArray(p.images) && p.images.length > 0;
                return (
                  <tr key={p.id} data-row-id={p.id}>
                    <td>
                      <div className="cell-product">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="cell-thumb" src={productImageSrc(p, 0)} alt="" />
                        <div>
                          <strong>{p.title}</strong>
                          <div className="muted small">
                            {formatDate(p.created_at)}
                            {hasPhoto ? (
                              <>
                                {" "}
                                &middot;{" "}
                                <span className="badge badge--success">
                                  {p.images!.length} photo{p.images!.length > 1 ? "s" : ""}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{categoryLabel(p.category)}</td>
                    <td>{money(p.base_price)}</td>
                    <td>
                      <Pill status={p.status || "pending"} />
                      {p.status === "flagged" && p.moderation_reason ? (
                        <p className="small muted">Admin note: {p.moderation_reason}</p>
                      ) : null}
                    </td>
                    <td>
                      {vs.length} variants &middot; {totalStock} units
                    </td>
                    <td>
                      <button className="btn btn--ghost btn--sm" onClick={() => setEditing(p)}>
                        Edit<span className="sr-only"> {p.title}</span>
                      </button>{" "}
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => duplicate(p)}>
                        Duplicate<span className="sr-only"> {p.title}</span>
                      </button>{" "}
                      <button
                        className="btn btn--ghost btn--sm"
                        disabled={p.status !== "approved"}
                        title={p.status !== "approved" ? "Only approved products can run a flash sale." : undefined}
                        onClick={() => openFlash(p.id)}
                      >
                        Flash sale
                      </button>{" "}
                      {p.status === "archived" ? (
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onPublish(p.id, true)}>
                          Republish
                        </button>
                      ) : (
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onPublish(p.id, false)}>
                          Unpublish
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </TableWrap>

      <ProductWizard
        product={editing}
        variants={variants}
        categories={categories}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
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

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { Pill } from "./Pill";
import { money, formatDate, productImageSrc } from "@/lib/format";
import { toast } from "@/lib/toast";
import { createProduct, updateProduct, deleteProduct, createFlashSale } from "@/lib/actions/seller";
import type { Category, Product, ProductVariant } from "@/lib/types";
import { TableWrap } from "./TableWrap";
import { DeepLinkFocus } from "./DeepLinkFocus";

type VariantDraft = {
  id?: number | null;
  color_name: string;
  size: string;
  stock_qty: number;
  sku_code: string;
};

const MAX_IMAGES = 3;
const MAX_BYTES = 1 * 1024 * 1024;

function resizeToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const max = 800;
        let w = img.width;
        let h = img.height;
        if (w > h && w > max) {
          h = Math.round((h * max) / w);
          w = max;
        } else if (h >= w && h > max) {
          w = Math.round((w * max) / h);
          h = max;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error("Could not read image."));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const flashDialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [flashProductId, setFlashProductId] = useState<number | null>(null);
  const [flashDiscount, setFlashDiscount] = useState(20);
  const [flashHours, setFlashHours] = useState(24);
  const [flashBusy, setFlashBusy] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState("");
  const [desc, setDesc] = useState("");
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [vBuffer, setVBuffer] = useState<VariantDraft[]>([]);
  const [busy, setBusy] = useState(false);

  const categoryLabel = (id: string | null) =>
    categories.find((c) => c.id === id)?.label || id || "Uncategorized";

  function openModal(product?: Product) {
    if (product) {
      setEditingId(product.id);
      setTitle(product.title);
      setCategory(product.category || "");
      setPrice(String(product.base_price));
      setImage(product.image || "");
      setDesc(product.description || "");
      setUploaded(Array.isArray(product.images) ? product.images.slice() : []);
      setVBuffer(
        variants
          .filter((v) => v.product_id === product.id)
          .map((v) => ({
            id: v.id,
            color_name: v.color_name,
            size: v.size || "One size",
            stock_qty: v.stock_qty,
            sku_code: v.sku_code,
          }))
      );
    } else {
      setEditingId(null);
      setTitle("");
      setCategory("");
      setPrice("");
      setImage("");
      setDesc("");
      setUploaded([]);
      setVBuffer([
        { color_name: "Natural", size: "One size", stock_qty: 10, sku_code: "SKU-NEW-" + Date.now() },
      ]);
    }
    dialogRef.current?.showModal();
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const next = [...uploaded];
    for (const f of files) {
      if (next.length >= MAX_IMAGES) {
        toast(`Maximum ${MAX_IMAGES} photos per product.`, "warning");
        break;
      }
      if (!/^image\//.test(f.type)) {
        toast("Not an image: " + f.name, "error");
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast(f.name + " is over 1 MB.", "error");
        continue;
      }
      try {
        next.push(await resizeToDataUrl(f));
      } catch (err) {
        toast((err as Error).message || "Image failed to load.", "error");
      }
    }
    setUploaded(next);
    if (fileRef.current) fileRef.current.value = "";
  }

  function setVariant(i: number, patch: Partial<VariantDraft>) {
    setVBuffer((b) => b.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }

  async function save(e: React.MouseEvent) {
    e.preventDefault();
    if (!title.trim() || !category || !(Number(price) >= 0)) {
      toast("Please complete the required fields.", "warning");
      return;
    }
    const variantInputs = vBuffer.map((v) => ({
      id: v.id ?? null,
      color_name: v.color_name.trim(),
      size: v.size.trim(),
      stock_qty: Math.max(0, Number(v.stock_qty) || 0),
      sku_code: v.sku_code.trim(),
    }));
    if (!variantInputs.length || variantInputs.some((v) => !v.color_name || !v.sku_code)) {
      toast("Add at least one complete variant.", "warning");
      return;
    }
    setBusy(true);
    const payload = {
      title: title.trim(),
      description: desc.trim(),
      base_price: Number(price),
      category,
      image: image.trim() || "\u{1F6CD}\u{FE0F}",
      images: uploaded.slice(0, MAX_IMAGES),
      variants: variantInputs,
    };
    const res = editingId
      ? await updateProduct(editingId, payload)
      : await createProduct(payload);
    setBusy(false);
    if (!res.ok) {
      toast(res.error || "Could not save product.", "error");
      return;
    }
    toast(editingId ? "Product updated." : "Product submitted for verification.", "success");
    dialogRef.current?.close();
    router.refresh();
  }

  function openFlash(id: number) {
    setFlashProductId(id);
    setFlashDiscount(20);
    setFlashHours(24);
    flashDialogRef.current?.showModal();
  }

  async function submitFlash(e: React.MouseEvent) {
    e.preventDefault();
    if (flashProductId == null) return;
    setFlashBusy(true);
    const res = await createFlashSale(flashProductId, flashDiscount, flashHours);
    setFlashBusy(false);
    if (!res.ok) {
      toast(res.error || "Could not start flash sale.", "error");
      return;
    }
    toast("Flash sale started.", "success");
    flashDialogRef.current?.close();
    router.refresh();
  }

  async function onDelete(id: number) {
    if (!confirm("Delete this product and all its variants?")) return;
    const res = await deleteProduct(id);
    if (!res.ok) {
      toast(res.error || "Could not delete.", "error");
      return;
    }
    toast("Product deleted.", "success");
    router.refresh();
  }

  return (
    <>
      <div className="page-head">
        <h1>Product catalog</h1>
        <button type="button" className="btn btn--primary" id="add-product" onClick={() => openModal()}>
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
                    </td>
                    <td>
                      {vs.length} variants &middot; {totalStock} units
                    </td>
                    <td>
                      <button className="btn btn--ghost btn--sm" onClick={() => openModal(p)}>
                        Edit
                      </button>{" "}
                      <button
                        className="btn btn--ghost btn--sm"
                        disabled={p.status !== "approved"}
                        title={p.status !== "approved" ? "Only approved products can run a flash sale." : undefined}
                        onClick={() => openFlash(p.id)}
                      >
                        Flash sale
                      </button>{" "}
                      <button className="btn btn--danger btn--sm" onClick={() => onDelete(p.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </TableWrap>

      <dialog id="product-modal" className="modal modal--wide" ref={dialogRef} aria-labelledby="pm-title">
        <form method="dialog" className="modal-form" id="product-form" noValidate>
          <h2 id="pm-title">Product</h2>
          <div className="row">
            <div className="field">
              <label htmlFor="pm-title-inp">Title</label>
              <input
                id="pm-title-inp"
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="pm-category">Category</label>
              <select id="pm-category" required value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="pm-price">Base price (PHP)</label>
              <input
                id="pm-price"
                type="number"
                min={0}
                step={0.01}
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="pm-image">Emoji / icon fallback</label>
              <input
                id="pm-image"
                placeholder="e.g. 👜, 🥭, 🎨"
                maxLength={4}
                value={image}
                onChange={(e) => setImage(e.target.value)}
              />
              <small className="hint">Used when no photos are uploaded.</small>
            </div>
          </div>

          <fieldset className="uploader">
            <legend>Product photos (up to 3)</legend>
            <div className="uploader-controls">
              <label className="btn btn--ghost" htmlFor="pm-photos">
                <span className="btn-icon" aria-hidden="true"></span>
                Choose photos
              </label>
              <input id="pm-photos" ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
              <small className="hint">
                JPG / PNG / WebP, max 1 MB each. Images are resized to ~800px.
              </small>
            </div>
            <div className="image-thumbs" id="pm-thumbs" role="list" aria-label="Uploaded photos">
              {uploaded.length === 0 ? (
                <p className="muted small">
                  No photos yet. A colored emoji card will be used as the thumbnail.
                </p>
              ) : (
                uploaded.map((src, i) => (
                  <div className="image-thumb" role="listitem" key={i}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Preview ${i + 1}`} />
                    <button
                      type="button"
                      className="image-thumb__remove"
                      aria-label={`Remove photo ${i + 1}`}
                      onClick={() => setUploaded((u) => u.filter((_, idx) => idx !== i))}
                    >
                      <Icon name="x" size={14} />
                    </button>
                    {i === 0 ? <span className="image-thumb__flag">Cover</span> : null}
                  </div>
                ))
              )}
            </div>
          </fieldset>

          <div className="field">
            <label htmlFor="pm-desc">Description</label>
            <textarea id="pm-desc" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)}></textarea>
          </div>

          <fieldset className="variants">
            <legend>Variants (color / size / stock)</legend>
            <div id="variant-rows">
              {vBuffer.map((v, i) => (
                <div className="variant-row" data-idx={i} key={i}>
                  <div className="field">
                    <label>Color</label>
                    <input value={v.color_name} onChange={(e) => setVariant(i, { color_name: e.target.value })} required />
                  </div>
                  <div className="field">
                    <label>Size</label>
                    <input value={v.size} onChange={(e) => setVariant(i, { size: e.target.value })} required />
                  </div>
                  <div className="field">
                    <label>Stock</label>
                    <input
                      type="number"
                      min={0}
                      value={v.stock_qty}
                      onChange={(e) => setVariant(i, { stock_qty: Number(e.target.value) })}
                      required
                    />
                  </div>
                  <div className="field">
                    <label>SKU</label>
                    <input value={v.sku_code} onChange={(e) => setVariant(i, { sku_code: e.target.value })} required />
                  </div>
                  <div className="field">
                    <label>&nbsp;</label>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setVBuffer((b) => b.filter((_, idx) => idx !== i))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn--ghost"
              id="add-variant"
              onClick={() =>
                setVBuffer((b) => [
                  ...b,
                  { color_name: "", size: "One size", stock_qty: 0, sku_code: "SKU-" + Date.now() },
                ])
              }
            >
              Add variant
            </button>
          </fieldset>

          <div className="form-actions">
            <button
              value="cancel"
              className="btn btn--ghost"
              onClick={(e) => {
                e.preventDefault();
                dialogRef.current?.close();
              }}
            >
              Cancel
            </button>
            <button value="submit" className="btn btn--primary" id="pm-save" disabled={busy} onClick={save}>
              Save product
            </button>
          </div>
        </form>
      </dialog>

      <dialog id="flash-modal" className="modal" ref={flashDialogRef} aria-labelledby="flash-title">
        <form method="dialog" className="modal-form" id="flash-form">
          <h2 id="flash-title">Start a flash sale</h2>
          <p className="hint">
            Buyers who wishlisted this product get notified immediately.
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
              Start flash sale
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

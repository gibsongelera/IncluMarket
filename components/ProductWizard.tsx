"use client";

import { useEffect, useRef, useState } from "react";
import { createProduct, updateProduct, uploadProductPhoto } from "@/lib/actions/seller";
import { ADAPTIVE_TAGS } from "@/lib/storefront-core";
import { money } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { Category, Product, ProductVariant } from "@/lib/types";

type Step = "basics" | "photos" | "options" | "features" | "review";
const STEPS: { id: Step; label: string }[] = [
  { id: "basics", label: "Basics" },
  { id: "photos", label: "Photos" },
  { id: "options", label: "Options and stock" },
  { id: "features", label: "PWD-friendly features" },
  { id: "review", label: "Check and save" },
];

type OptionDraft = { id: number | null; color_name: string; size: string; stock_qty: string; sku_code: string };

const MAX_PHOTOS = 3;
const MAX_SIDE = 1200;
const MAX_BYTES = 1_000_000;

/** Resize and re-encode in the browser: smaller uploads, and no EXIF/GPS. */
async function toJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.75, 0.62]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
      if (blob && blob.size <= MAX_BYTES) return blob;
    }
    throw new Error("too-large");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Add or edit a product, one step at a time (C-32): Basics → Photos →
 * Options and stock → PWD-friendly features → Check and save. Every step can
 * be revisited; nothing is lost on an error. Photos go to Storage (ADR-4).
 */
export function ProductWizard({
  product,
  variants,
  categories,
  onClose,
  onSaved,
}: {
  /** "new", an existing product, or null when closed. */
  product: Product | "new" | null;
  variants: ProductVariant[];
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("basics");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [desc, setDesc] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editing = product && product !== "new" ? product : null;

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (product && !dlg.open) {
      setStep("basics");
      setError(null);
      if (editing) {
        setTitle(editing.title);
        setCategory(editing.category ?? "");
        setPrice(String(editing.base_price));
        setDesc(editing.description ?? "");
        setPhotos(Array.isArray(editing.images) ? editing.images.slice(0, MAX_PHOTOS) : []);
        setTags(editing.adaptive_tags ?? []);
        setOptions(
          variants
            .filter((v) => v.product_id === editing.id)
            .map((v) => ({ id: v.id, color_name: v.color_name, size: v.size ?? "", stock_qty: String(v.stock_qty), sku_code: v.sku_code }))
        );
      } else {
        setTitle("");
        setCategory("");
        setPrice("");
        setDesc("");
        setPhotos([]);
        setTags([]);
        setOptions([{ id: null, color_name: "Standard", size: "", stock_qty: "1", sku_code: "" }]);
      }
      dlg.showModal();
    } else if (!product && dlg.open) {
      dlg.close();
    }
    // Reset only when a different product is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  function check(s: Step): string | null {
    if (s === "basics") {
      if (title.trim().length < 3) return "Give the product a name (3 characters or more).";
      if (!category) return "Choose a category.";
      if (price === "" || !(Number(price) >= 0)) return "Enter the price in pesos, for example 450.";
    }
    if (s === "options") {
      if (!options.length) return "Keep at least one option, even if it is just “Standard”.";
      if (options.some((o) => !o.color_name.trim())) return "Each option needs a name, for example the colour.";
      if (options.some((o) => !/^\d+$/.test(o.stock_qty.trim()))) return "Stock is a whole number, 0 or more.";
    }
    return null;
  }

  function go(to: Step) {
    const here = STEPS.findIndex((s) => s.id === step);
    const there = STEPS.findIndex((s) => s.id === to);
    if (there > here) {
      for (const s of STEPS.slice(0, there)) {
        const problem = check(s.id);
        if (problem) {
          setError(problem);
          setStep(s.id);
          return;
        }
      }
    }
    setError(null);
    setStep(to);
  }

  async function addPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    setError(null);
    const next = [...photos];
    for (const file of files) {
      if (next.length >= MAX_PHOTOS) {
        toast(`Up to ${MAX_PHOTOS} photos per product.`, "warning");
        break;
      }
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        toast(`${file.name} is not a JPEG, PNG or WebP photo.`, "error");
        continue;
      }
      try {
        const blob = await toJpeg(file);
        const fd = new FormData();
        fd.set("photo", new File([blob], "photo.jpg", { type: "image/jpeg" }));
        const res = await uploadProductPhoto(fd);
        if (!res.ok || !res.url) {
          toast(res.error || `Could not upload ${file.name}.`, "error");
          continue;
        }
        next.push(res.url);
      } catch {
        toast(`Could not read ${file.name}. Try another photo.`, "error");
      }
    }
    setPhotos(next);
    setUploading(false);
  }

  function movePhoto(i: number, by: -1 | 1) {
    setPhotos((list) => {
      const to = i + by;
      if (to < 0 || to >= list.length) return list;
      const copy = list.slice();
      [copy[i], copy[to]] = [copy[to], copy[i]];
      return copy;
    });
  }

  async function save() {
    for (const s of ["basics", "options"] as Step[]) {
      const problem = check(s);
      if (problem) {
        setError(problem);
        setStep(s);
        return;
      }
    }
    setBusy(true);
    setError(null);
    const payload = {
      title: title.trim(),
      description: desc.trim(),
      base_price: Number(price),
      category,
      image: editing?.image || "\u{1F6CD}\u{FE0F}",
      images: photos,
      adaptiveTags: tags,
      variants: options.map((o) => ({
        id: o.id,
        color_name: o.color_name.trim(),
        size: o.size.trim(),
        stock_qty: Number(o.stock_qty),
        sku_code: o.sku_code.trim(),
      })),
    };
    const res = editing ? await updateProduct(editing.id, payload) : await createProduct(payload);
    setBusy(false);
    if (!res.ok) return setError(res.error || "Could not save the product.");
    toast(
      res.backToReview
        ? "Saved. Because buyers see these details, the listing is hidden until it is reviewed again."
        : editing
          ? "Product updated."
          : "Product sent for review. It appears in the shop once approved.",
      res.backToReview ? "info" : "success"
    );
    onSaved();
  }

  const index = STEPS.findIndex((s) => s.id === step);
  const catLabel = categories.find((c) => c.id === category)?.label ?? "";

  return (
    <dialog
      ref={ref}
      className="modal modal--wide"
      aria-labelledby="pw-step-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy && !uploading) onClose();
      }}
    >
      <div className="modal-form wizard">
        <h2 className="wizard__title">{editing ? `Edit “${editing.title}”` : "Add a product"}</h2>
        <ol className="steps" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s.id} className={`steps__item${i === index ? " steps__item--current" : ""}${i < index ? " steps__item--done" : ""}`} aria-current={i === index ? "step" : undefined}>
              <button type="button" className="steps__jump" onClick={() => go(s.id)}>
                <span className="steps__num" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="steps__label">{s.label}</span>
              </button>
            </li>
          ))}
        </ol>

        <h3 id="pw-step-title" ref={headingRef} tabIndex={-1} className="verify-flow__title">
          Step {index + 1} of {STEPS.length}: {STEPS[index].label}
        </h3>

        {step === "basics" ? (
          <div className="wizard__body">
            <div className="field">
              <label htmlFor="pw-title">Product name</label>
              <input id="pw-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="pw-cat">Category</label>
                <select id="pw-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Choose…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="pw-price">Price (₱)</label>
                <input id="pw-price" type="number" min={0} step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="pw-desc">Description</label>
              <textarea id="pw-desc" rows={5} maxLength={5000} value={desc} onChange={(e) => setDesc(e.target.value)} aria-describedby="pw-desc-hint" />
              <p className="hint" id="pw-desc-hint">
                What it is, what it is made of, its size, and how to care for it.
              </p>
            </div>
          </div>
        ) : null}

        {step === "photos" ? (
          <div className="wizard__body">
            <p>
              Up to {MAX_PHOTOS} photos. The first one is the cover. Photos are resized and their location data removed
              before they are uploaded.
            </p>
            {photos.length ? (
              <ol className="photo-list">
                {photos.map((src, i) => (
                  <li key={src.slice(-48) + i}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- seller's own photo preview */}
                    <img src={src} alt={`Photo ${i + 1}${i === 0 ? " (cover)" : ""}`} />
                    <div className="photo-list__actions">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => movePhoto(i, -1)} disabled={i === 0}>
                        Move earlier<span className="sr-only">: photo {i + 1}</span>
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => movePhoto(i, 1)} disabled={i === photos.length - 1}>
                        Move later<span className="sr-only">: photo {i + 1}</span>
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPhotos((l) => l.filter((_, j) => j !== i))}>
                        Remove<span className="sr-only">: photo {i + 1}</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">No photos yet. Listings with clear photos sell better.</p>
            )}
            {photos.length < MAX_PHOTOS ? (
              <p>
                <button type="button" className="btn btn--outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? "Uploading…" : "Add photos"}
                </button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={addPhotos} />
              </p>
            ) : null}
          </div>
        ) : null}

        {step === "options" ? (
          <div className="wizard__body">
            <p>Each option has its own stock, for example a colour or a size. Leave SKU empty to have one made for you.</p>
            <div className="option-list">
              {options.map((o, i) => (
                <fieldset key={o.id ?? `new-${i}`} className="option-row">
                  <legend className="sr-only">Option {i + 1}</legend>
                  <div className="field">
                    <label htmlFor={`pw-o${i}-name`}>Name or colour</label>
                    <input id={`pw-o${i}-name`} value={o.color_name} onChange={(e) => setOptions((l) => l.map((x, j) => (j === i ? { ...x, color_name: e.target.value } : x)))} />
                  </div>
                  <div className="field">
                    <label htmlFor={`pw-o${i}-size`}>
                      Size <span className="muted">(optional)</span>
                    </label>
                    <input id={`pw-o${i}-size`} value={o.size} onChange={(e) => setOptions((l) => l.map((x, j) => (j === i ? { ...x, size: e.target.value } : x)))} />
                  </div>
                  <div className="field">
                    <label htmlFor={`pw-o${i}-stock`}>Stock</label>
                    <input id={`pw-o${i}-stock`} type="number" min={0} inputMode="numeric" value={o.stock_qty} onChange={(e) => setOptions((l) => l.map((x, j) => (j === i ? { ...x, stock_qty: e.target.value } : x)))} />
                  </div>
                  <div className="field">
                    <label htmlFor={`pw-o${i}-sku`}>
                      SKU <span className="muted">(optional)</span>
                    </label>
                    <input id={`pw-o${i}-sku`} value={o.sku_code} onChange={(e) => setOptions((l) => l.map((x, j) => (j === i ? { ...x, sku_code: e.target.value } : x)))} />
                  </div>
                  <button type="button" className="btn btn--ghost btn--sm option-row__remove" onClick={() => setOptions((l) => l.filter((_, j) => j !== i))} disabled={options.length === 1}>
                    Remove<span className="sr-only"> option {i + 1}</span>
                  </button>
                </fieldset>
              ))}
            </div>
            <p>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => setOptions((l) => [...l, { id: null, color_name: "", size: "", stock_qty: "0", sku_code: "" }])}>
                Add an option
              </button>
            </p>
          </div>
        ) : null}

        {step === "features" ? (
          <fieldset className="wizard__body radio-group">
            <legend>Which of these does your product have? (optional)</legend>
            <p className="hint">Buyers can filter by these. Tick only what is true.</p>
            {ADAPTIVE_TAGS.map((t) => (
              <label key={t.key} className="radio">
                <input
                  type="checkbox"
                  checked={tags.includes(t.key)}
                  onChange={(e) => setTags((l) => (e.target.checked ? [...l, t.key] : l.filter((x) => x !== t.key)))}
                />
                {t.label}
              </label>
            ))}
          </fieldset>
        ) : null}

        {step === "review" ? (
          <div className="wizard__body">
            <dl className="details-list">
              <dt>Name</dt>
              <dd>{title}</dd>
              <dt>Category</dt>
              <dd>{catLabel}</dd>
              <dt>Price</dt>
              <dd>{price === "" ? "—" : money(Number(price))}</dd>
              <dt>Photos</dt>
              <dd>{photos.length}</dd>
              <dt>Options</dt>
              <dd>{options.map((o) => `${o.color_name}${o.size ? ` · ${o.size}` : ""} (${o.stock_qty})`).join(", ")}</dd>
              <dt>PWD-friendly</dt>
              <dd>{tags.length ? ADAPTIVE_TAGS.filter((t) => tags.includes(t.key)).map((t) => t.label).join(", ") : "None"}</dd>
            </dl>
            <p className="hint">
              {editing && editing.status === "approved"
                ? "Changing the name, description, price, category, photos or features sends the listing back to review. Stock and options do not."
                : "New and edited listings are reviewed before they appear in the shop."}
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy || uploading}>
            Cancel
          </button>
          {index > 0 ? (
            <button type="button" className="btn btn--ghost" onClick={() => go(STEPS[index - 1].id)} disabled={busy}>
              Back
            </button>
          ) : null}
          {step === "review" ? (
            <button type="button" className="btn btn--primary" onClick={save} disabled={busy || uploading}>
              {busy ? "Saving…" : editing ? "Save changes" : "Send for review"}
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => go(STEPS[index + 1].id)} disabled={uploading}>
              Continue
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

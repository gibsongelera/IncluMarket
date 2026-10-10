"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Product } from "@/lib/types";

type Win = { position: number | null; from: string | null; until: string | null };

/** "live", or why a featured listing is not on the homepage right now. */
export function featureState(p: Pick<Product, "is_featured" | "featured_from" | "featured_until">): string {
  if (!p.is_featured) return "off";
  const now = Date.now();
  if (p.featured_from && Date.parse(p.featured_from) > now) return "Starts later";
  if (p.featured_until && Date.parse(p.featured_until) <= now) return "Ended — no longer shown";
  return "live";
}

/** ISO → value for <input type="datetime-local"> in the viewer's time zone. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Feature a listing on the homepage: its place in the "Featured products"
 * rail and an optional start and end. A feature that ends drops off the
 * homepage by itself (C-19).
 */
export function FeatureDialog({
  product,
  onClose,
  onSave,
}: {
  product: Product | null;
  onClose: () => void;
  /** Returns an error message, or null on success. */
  onSave: (featured: boolean, win: Win) => Promise<string | null>;
}) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [position, setPosition] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (product && !dlg.open) {
      setPosition(product.featured_position != null ? String(product.featured_position) : "");
      setFrom(toLocalInput(product.featured_from));
      setUntil(toLocalInput(product.featured_until));
      setError(null);
      dlg.showModal();
    } else if (!product && dlg.open) {
      dlg.close();
    }
  }, [product]);

  async function save(featured: boolean) {
    setBusy(true);
    setError(null);
    const err = await onSave(featured, {
      position: position === "" ? null : Number(position),
      from: from ? new Date(from).toISOString() : null,
      until: until ? new Date(until).toISOString() : null,
    });
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        className="modal-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save(true);
        }}
      >
        <h2 id={`${id}-title`}>{product?.is_featured ? "Edit feature" : "Feature on the homepage"}</h2>
        <p>{product?.title}</p>
        <div className="field">
          <label htmlFor={`${id}-pos`}>Order in the rail (optional)</label>
          <input
            id={`${id}-pos`}
            type="number"
            min={0}
            max={999}
            inputMode="numeric"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            aria-describedby={`${id}-pos-hint`}
          />
          <p className="hint" id={`${id}-pos-hint`}>
            Lower numbers come first. Leave empty to show after numbered ones.
          </p>
        </div>
        <div className="field">
          <label htmlFor={`${id}-from`}>Starts (optional)</label>
          <input id={`${id}-from`} type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-until`}>Ends (optional)</label>
          <input id={`${id}-until`} type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
          <p className="hint">The listing leaves the homepage at this time by itself.</p>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="form-actions">
          {product?.is_featured ? (
            <button type="button" className="btn btn--ghost" onClick={() => save(false)} disabled={busy}>
              Stop featuring
            </button>
          ) : null}
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

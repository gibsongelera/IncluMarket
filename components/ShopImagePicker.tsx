"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setShopImage, uploadProductPhoto } from "@/lib/actions/seller";
import { toJpeg } from "@/lib/image-client";
import { toast } from "@/lib/toast";

/** Shop logo or banner: upload (resized, no location data), change or remove. */
export function ShopImagePicker({
  kind,
  label,
  hint,
  url,
  disabled,
}: {
  kind: "logo" | "banner";
  label: string;
  hint: string;
  url: string | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const blob = await toJpeg(file, kind === "banner" ? 1600 : 600);
      const fd = new FormData();
      fd.set("photo", new File([blob], `${kind}.jpg`, { type: "image/jpeg" }));
      const up = await uploadProductPhoto(fd);
      if (!up.ok || !up.url) throw new Error(up.error || "Could not upload the image.");
      const res = await setShopImage(kind, up.url);
      if (!res.ok) throw new Error(res.error || "Could not save the image.");
      toast(`${label} updated.`, "success");
      router.refresh();
    } catch (err) {
      toast((err as Error).message || "Could not use that image.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    const res = await setShopImage(kind, null);
    setBusy(false);
    if (!res.ok) return toast(res.error || "Could not remove it.", "error");
    toast(`${label} removed.`, "success");
    router.refresh();
  }

  return (
    <div className={`shop-image shop-image--${kind}`}>
      <p className="field__label">{label}</p>
      <p className="hint">{hint}</p>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- seller's own image preview
        <img src={url} alt="" className="shop-image__preview" />
      ) : (
        <p className="muted small">None yet.</p>
      )}
      <div className="form-actions form-actions--start">
        <button type="button" className="btn btn--outline btn--sm" onClick={() => fileRef.current?.click()} disabled={disabled || busy}>
          {busy ? "Working…" : url ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
        </button>
        {url ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={remove} disabled={busy}>
            Remove<span className="sr-only"> {label.toLowerCase()}</span>
          </button>
        ) : null}
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} />
    </div>
  );
}

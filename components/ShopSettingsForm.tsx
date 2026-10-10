"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateShopSettings } from "@/lib/actions/seller";
import { toast } from "@/lib/toast";

/** Seller Centre → Shop settings (C-36). What buyers see on the shop page. */
export function ShopSettingsForm({
  sellerId,
  initial,
  available,
}: {
  sellerId: number;
  initial: { shopName: string; story: string; city: string };
  available: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await updateShopSettings(f);
    setBusy(false);
    if (!res.ok) return setError({ field: res.field, text: res.error || "Could not save." });
    toast("Shop settings saved.", "success");
    router.refresh();
  }

  return (
    <form className="card form shop-settings" onSubmit={save} noValidate>
      {!available ? (
        <p className="notice notice--info">Shop name and city need the latest database update. Your story can be saved now.</p>
      ) : null}
      <div className="field">
        <label htmlFor="ss-name">
          Shop name <span className="muted">(optional)</span>
        </label>
        <input
          id="ss-name"
          value={f.shopName}
          disabled={!available}
          maxLength={80}
          aria-invalid={error?.field === "shopName" ? true : undefined}
          aria-describedby="ss-name-hint"
          onChange={(e) => setF({ ...f, shopName: e.target.value })}
        />
        <p className="hint" id="ss-name-hint">
          Empty: buyers see your own name.
        </p>
      </div>
      <div className="field">
        <label htmlFor="ss-story">Your story</label>
        <textarea
          id="ss-story"
          rows={5}
          maxLength={1000}
          value={f.story}
          aria-describedby="ss-story-hint"
          onChange={(e) => setF({ ...f, story: e.target.value })}
        />
        <p className="hint" id="ss-story-hint">
          How you make your products and what they mean to you. Shown on your shop page. You decide what to share —
          you never have to describe your disability. ({f.story.length}/1000)
        </p>
      </div>
      <div className="field">
        <label htmlFor="ss-city">
          City <span className="muted">(optional)</span>
        </label>
        <input id="ss-city" value={f.city} disabled={!available} maxLength={80} onChange={(e) => setF({ ...f, city: e.target.value })} />
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error.text}
        </p>
      ) : null}
      <div className="form-actions form-actions--start">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Saving…" : "Save shop settings"}
        </button>
        <Link className="btn btn--ghost" href={`/shop/${sellerId}`}>
          View my shop
        </Link>
      </div>
    </form>
  );
}

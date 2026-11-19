"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteBanner, moveBanner, saveBanner, setBannerActive } from "@/lib/actions/admin-content";
import type { AdminBanner } from "@/lib/admin-content";
import { toJpeg } from "@/lib/image-client";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { TableWrap } from "./TableWrap";

/** An instant as a datetime-local value in Philippine time. */
function manilaLocal(iso: string | null): string {
  if (!iso) return "";
  return new Date(Date.parse(iso) + 8 * 3_600_000).toISOString().slice(0, 16);
}

function stateOf(b: AdminBanner): { label: string; pill: string } {
  if (b.live) return { label: "Showing", pill: "active" };
  if (!b.active) return { label: "Hidden", pill: "archived" };
  if (b.endsAt && Date.parse(b.endsAt) <= Date.now()) return { label: "Ended", pill: "archived" };
  return { label: "Scheduled", pill: "pending" };
}

/** Admin → Banners (C-40). */
export function AdminBannersClient({ banners }: { banners: AdminBanner[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminBanner | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminBanner | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(work: Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true);
    const res = await work;
    setBusy(false);
    if (!res.ok) return toast(res.error || "That did not work.", "error");
    toast(done, "success");
    router.refresh();
  }

  return (
    <>
      <p>
        <button type="button" className="btn btn--primary" onClick={() => setEditing("new")}>
          New banner
        </button>
      </p>

      {banners.length === 0 ? (
        <p className="empty">No banners. The homepage shows the featured products and categories without one.</p>
      ) : (
        <TableWrap label="Banners">
          <table className="data-table data-table--cards">
            <thead>
              <tr>
                <th>Order</th>
                <th>Banner</th>
                <th>When</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {banners.map((b, i) => {
                const s = stateOf(b);
                return (
                  <tr key={b.id} data-row-id={b.id}>
                    <td>
                      <span className="row-actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={busy || i === 0}
                          onClick={() => run(moveBanner(b.id, "up"), `“${b.title}” moved up.`)}
                        >
                          Up<span className="sr-only">: move {b.title} up</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={busy || i === banners.length - 1}
                          onClick={() => run(moveBanner(b.id, "down"), `“${b.title}” moved down.`)}
                        >
                          Down<span className="sr-only">: move {b.title} down</span>
                        </button>
                      </span>
                    </td>
                    <td>
                      {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of an uploaded banner */}
                      <img src={b.image} alt="" className="banner-admin__thumb" />
                      <strong>{b.title}</strong>
                      <div className="small muted">Alt text: {b.alt}</div>
                      <div className="small">{b.link ? <code>{b.link}</code> : "No link"}</div>
                    </td>
                    <td className="small">
                      From {formatDateTime(b.startsAt)}
                      <div>{b.endsAt ? `Until ${formatDateTime(b.endsAt)}` : "No end date"}</div>
                    </td>
                    <td>
                      <span className={`pill pill--${s.pill}`}>{s.label}</span>
                    </td>
                    <td>
                      <span className="row-actions">
                        <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => setEditing(b)}>
                          Edit<span className="sr-only"> {b.title}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={busy}
                          onClick={() =>
                            run(setBannerActive(b.id, !b.active), b.active ? `“${b.title}” is hidden.` : `“${b.title}” can show again.`)
                          }
                        >
                          {b.active ? "Hide" : "Show"}
                          <span className="sr-only"> {b.title}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={busy}
                          onClick={() => {
                            setError(null);
                            setDeleting(b);
                          }}
                        >
                          Delete…<span className="sr-only"> {b.title}</span>
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete “${deleting?.title ?? ""}”?`}
        confirmLabel="Delete banner"
        tone="danger"
        busy={busy}
        error={error}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          const res = await deleteBanner(deleting.id);
          setBusy(false);
          if (!res.ok) return setError(res.error || "Could not delete it.");
          setDeleting(null);
          toast("Banner deleted.", "success");
          router.refresh();
        }}
      >
        <p>To take it off the homepage for now, use Hide instead.</p>
      </ConfirmDialog>

      <BannerDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />
    </>
  );
}

function BannerDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing: AdminBanner | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const existing = editing && editing !== "new" ? editing : null;
  const [f, setF] = useState({ title: "", alt: "", link: "", startsAt: "", endsAt: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (editing && !dlg.open) {
      setF({
        title: existing?.title ?? "",
        alt: existing?.alt ?? "",
        link: existing?.link ?? "",
        startsAt: manilaLocal(existing?.startsAt ?? null),
        endsAt: manilaLocal(existing?.endsAt ?? null),
      });
      setFile(null);
      setError(null);
      dlg.showModal();
    } else if (!editing && dlg.open) dlg.close();
    // existing is derived from editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!existing && !file) return setError("Choose a banner image.");
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      if (existing) fd.set("id", String(existing.id));
      fd.set("title", f.title);
      fd.set("alt", f.alt);
      fd.set("link", f.link);
      fd.set("startsAt", f.startsAt);
      fd.set("endsAt", f.endsAt);
      if (file) {
        const blob = await toJpeg(file, 1600);
        fd.set("photo", new File([blob], "banner.jpg", { type: "image/jpeg" }));
      }
      const res = await saveBanner(fd);
      if (!res.ok) return setError(res.error || "Could not save the banner.");
      toast(existing ? "Banner saved." : "Banner added.", "success");
      onSaved();
    } catch (err) {
      setError((err as Error).message || "Could not use that image.");
    } finally {
      setBusy(false);
    }
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
      <form className="modal-form" onSubmit={submit} noValidate>
        <h2 id={`${id}-title`}>{existing ? "Edit banner" : "New banner"}</h2>
        <div className="field">
          <label htmlFor={`${id}-photo`}>{existing ? "Replace image (optional)" : "Image"}</label>
          <input
            id={`${id}-photo`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-describedby={`${id}-photo-hint`}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="hint" id={`${id}-photo-hint`}>
            Wide, about 1600 × 600. Resized on your device; location data is removed.
          </p>
        </div>
        <div className="field">
          <label htmlFor={`${id}-heading`}>Title</label>
          <input id={`${id}-heading`} maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <p className="hint">Shown under the image.</p>
        </div>
        <div className="field">
          <label htmlFor={`${id}-alt`}>Image description (alt text)</label>
          <textarea
            id={`${id}-alt`}
            rows={2}
            maxLength={200}
            value={f.alt}
            onChange={(e) => setF({ ...f, alt: e.target.value })}
            aria-describedby={`${id}-alt-hint`}
          />
          <p className="hint" id={`${id}-alt-hint`}>
            Include any words that appear in the image. Screen reader users hear this instead of seeing it.
          </p>
        </div>
        <div className="field">
          <label htmlFor={`${id}-link`}>Link (optional)</label>
          <input
            id={`${id}-link`}
            maxLength={300}
            placeholder="/search?category=bags"
            value={f.link}
            onChange={(e) => setF({ ...f, link: e.target.value })}
            aria-describedby={`${id}-link-hint`}
          />
          <p className="hint" id={`${id}-link-hint`}>
            A page in this shop, starting with /.
          </p>
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor={`${id}-start`}>Starts (Philippine time)</label>
            <input
              id={`${id}-start`}
              type="datetime-local"
              value={f.startsAt}
              onChange={(e) => setF({ ...f, startsAt: e.target.value })}
            />
            <p className="hint">Leave empty to start now.</p>
          </div>
          <div className="field">
            <label htmlFor={`${id}-end`}>Ends (optional)</label>
            <input id={`${id}-end`} type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />
          </div>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Saving…" : existing ? "Save" : "Add banner"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

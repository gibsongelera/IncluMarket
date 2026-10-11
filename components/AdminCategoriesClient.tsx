"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { moveCategory, saveCategory, setCategoryActive } from "@/lib/actions/admin-content";
import type { AdminCategory } from "@/lib/admin-content";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { TableWrap } from "./TableWrap";

/** Admin → Categories (C-40). Reordering uses buttons, never drag and drop. */
export function AdminCategoriesClient({ categories, managed }: { categories: AdminCategory[]; managed: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminCategory | "new" | null>(null);
  const [retiring, setRetiring] = useState<AdminCategory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(c: AdminCategory, direction: "up" | "down") {
    setBusy(true);
    const res = await moveCategory(c.id, direction);
    setBusy(false);
    if (!res.ok) return toast(res.error || "Could not move it.", "error");
    toast(`${c.name} moved ${direction}.`, "success");
    router.refresh();
  }

  async function restore(c: AdminCategory) {
    setBusy(true);
    const res = await setCategoryActive(c.id, true);
    setBusy(false);
    if (!res.ok) return toast(res.error || "Could not restore it.", "error");
    toast(`${c.name} is back in the shop's filters.`, "success");
    router.refresh();
  }

  return (
    <>
      <p>
        <button type="button" className="btn btn--primary" onClick={() => setEditing("new")}>
          New category
        </button>
      </p>

      {categories.length === 0 ? (
        <p className="empty">No categories yet. Sellers need at least one to list a product.</p>
      ) : (
        <TableWrap label="Categories">
          <table className="data-table data-table--cards">
            <thead>
              <tr>
                <th>Order</th>
                <th>Category</th>
                <th>Products</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c, i) => (
                <tr key={c.id} data-row-id={c.id}>
                  <td>
                    {managed ? (
                      <span className="row-actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => move(c, "up")}
                          disabled={busy || i === 0}
                        >
                          Up<span className="sr-only">: move {c.name} up</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => move(c, "down")}
                          disabled={busy || i === categories.length - 1}
                        >
                          Down<span className="sr-only">: move {c.name} down</span>
                        </button>
                      </span>
                    ) : (
                      i + 1
                    )}
                  </td>
                  <td>
                    <strong>{c.name}</strong>
                    <div className="small muted">
                      <code>{c.id}</code>
                    </div>
                    {c.description ? <div className="small">{c.description}</div> : null}
                  </td>
                  <td>
                    {c.liveProducts} in the shop
                    {c.products !== c.liveProducts ? <div className="small muted">{c.products} in all</div> : null}
                  </td>
                  <td>
                    <span className={`pill pill--${c.active ? "active" : "archived"}`}>{c.active ? "Open" : "Retired"}</span>
                  </td>
                  <td>
                    <button type="button" className="btn btn--outline btn--sm" onClick={() => setEditing(c)} disabled={busy}>
                      Edit<span className="sr-only"> {c.name}</span>
                    </button>{" "}
                    {managed ? (
                      c.active ? (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => {
                            setError(null);
                            setRetiring(c);
                          }}
                          disabled={busy}
                        >
                          Retire…<span className="sr-only"> {c.name}</span>
                        </button>
                      ) : (
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => restore(c)} disabled={busy}>
                          Restore<span className="sr-only"> {c.name}</span>
                        </button>
                      )
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      <ConfirmDialog
        open={Boolean(retiring)}
        title={`Retire “${retiring?.name ?? ""}”?`}
        confirmLabel="Retire category"
        busy={busy}
        error={error}
        onCancel={() => setRetiring(null)}
        onConfirm={async () => {
          if (!retiring) return;
          setBusy(true);
          const res = await setCategoryActive(retiring.id, false);
          setBusy(false);
          if (!res.ok) return setError(res.error || "Could not retire it.");
          toast(`${retiring.name} is retired. Its products are still in the shop.`, "success");
          setRetiring(null);
          router.refresh();
        }}
      >
        <p>
          It leaves the shop&rsquo;s filters and sellers can no longer choose it for new listings. Its{" "}
          {retiring?.products ?? 0} product(s) stay listed and keep this category. You can restore it later.
        </p>
      </ConfirmDialog>

      <CategoryDialog
        editing={editing}
        managed={managed}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />
    </>
  );
}

function CategoryDialog({
  editing,
  managed,
  onClose,
  onSaved,
}: {
  editing: AdminCategory | "new" | null;
  managed: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (editing && !dlg.open) {
      setName(existing?.name ?? "");
      setDescription(existing?.description ?? "");
      setIcon(existing?.icon ?? "");
      setError(null);
      dlg.showModal();
    } else if (!editing && dlg.open) dlg.close();
    // existing is derived from editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await saveCategory({ id: existing?.id ?? null, name, description, icon: icon || null });
    setBusy(false);
    if (!res.ok) return setError(res.error || "Could not save it.");
    toast(existing ? "Category saved." : `${name.trim()} added.`, "success");
    onSaved();
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
        <h2 id={`${id}-title`}>{existing ? `Edit ${existing.name}` : "New category"}</h2>
        <div className="field">
          <label htmlFor={`${id}-name`}>Name</label>
          <input id={`${id}-name`} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} required />
          {existing ? null : (
            <p className="hint">The web address is made from the name and does not change later.</p>
          )}
        </div>
        {managed ? (
          <>
            <div className="field">
              <label htmlFor={`${id}-desc`}>Description (optional)</label>
              <textarea
                id={`${id}-desc`}
                rows={2}
                maxLength={300}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`${id}-icon`}>Icon</label>
              <select id={`${id}-icon`} value={icon} onChange={(e) => setIcon(e.target.value)}>
                <option value="">Default</option>
                {CATEGORY_ICONS.map((i) => (
                  <option key={i.key} value={i.key}>
                    {i.label}
                  </option>
                ))}
              </select>
              <p className="hint">Decorative only. The name is what screen readers read.</p>
            </div>
          </>
        ) : null}
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
            {busy ? "Saving…" : existing ? "Save" : "Add category"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

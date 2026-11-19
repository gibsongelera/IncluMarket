"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAddress, saveAddress, setDefaultAddress } from "@/lib/actions/account";
import { addressLine, type AddressField, type AddressLite } from "@/lib/address";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "./ConfirmDialog";

type Fields = Record<AddressField, string>;
const EMPTY: Fields = { label: "", recipient: "", phone: "", line1: "", barangay: "", city: "", province: "", postalCode: "" };

/** Account → Addresses (C-30): list, add, edit, remove, choose the default. */
export function AddressBook({ addresses, available }: { addresses: AddressLite[]; available: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AddressLite | "new" | null>(null);
  const [removing, setRemoving] = useState<AddressLite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function makeDefault(a: AddressLite) {
    setBusy(true);
    const res = await setDefaultAddress(a.id);
    setBusy(false);
    if (!res.ok) return toast(res.error || "Could not update.", "error");
    toast("Default address updated.", "success");
    router.refresh();
  }

  if (!available) {
    return <p className="notice notice--info">Saved addresses need the latest database update.</p>;
  }

  return (
    <>
      {addresses.length ? (
        <ul className="address-list" role="list">
          {addresses.map((a) => (
            <li key={a.id} className="card address-card">
              <p className="address-card__name">
                <strong>{a.label ? `${a.label} · ${a.recipient}` : a.recipient}</strong>
                {a.isDefault ? <span className="badge">Default</span> : null}
              </p>
              <p>
                {addressLine(a)}, {a.city}
              </p>
              <p className="muted">{a.phone}</p>
              <div className="form-actions form-actions--start">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(a)}>
                  Edit<span className="sr-only"> address for {a.recipient}</span>
                </button>
                {a.isDefault ? null : (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => makeDefault(a)} disabled={busy}>
                    Make default
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setError(null);
                    setRemoving(a);
                  }}
                >
                  Remove<span className="sr-only"> address for {a.recipient}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">No saved addresses yet. Add one here, or save it at checkout.</p>
      )}
      {addresses.length < 10 ? (
        <p>
          <button type="button" className="btn btn--primary" onClick={() => setEditing("new")}>
            Add an address
          </button>
        </p>
      ) : null}

      <AddressDialog
        address={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove this address?"
        confirmLabel="Remove"
        tone="danger"
        busy={busy}
        error={error}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          setBusy(true);
          const res = await deleteAddress(removing.id);
          setBusy(false);
          if (!res.ok) return setError(res.error || "Could not remove it.");
          setRemoving(null);
          toast("Address removed.", "success");
          router.refresh();
        }}
      >
        <p>{removing ? `${addressLine(removing)}, ${removing.city}` : ""}</p>
      </ConfirmDialog>
    </>
  );
}

function AddressDialog({
  address,
  onClose,
  onSaved,
}: {
  address: AddressLite | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [makeDefault, setMakeDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; text: string } | null>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (address && !dlg.open) {
      setFields(
        address === "new"
          ? EMPTY
          : {
              label: address.label ?? "",
              recipient: address.recipient,
              phone: address.phone,
              line1: address.line1,
              barangay: address.barangay ?? "",
              city: address.city,
              province: address.province ?? "",
              postalCode: address.postalCode ?? "",
            }
      );
      setMakeDefault(address !== "new" && address.isDefault);
      setError(null);
      dlg.showModal();
    } else if (!address && dlg.open) {
      dlg.close();
    }
  }, [address]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await saveAddress({ ...fields, id: address && address !== "new" ? address.id : undefined, makeDefault });
    setBusy(false);
    if (!res.ok) {
      setError({ field: res.field, text: res.error || "Could not save." });
      if (res.field) document.getElementById(`${id}-${res.field}`)?.focus();
      return;
    }
    toast("Address saved.", "success");
    onSaved();
  }

  const input = (name: AddressField, label: string, opts: { optional?: boolean; autoComplete?: string; inputMode?: "tel" | "numeric" } = {}) => (
    <div className="field">
      <label htmlFor={`${id}-${name}`}>
        {label}
        {opts.optional ? <span className="muted"> (optional)</span> : null}
      </label>
      <input
        id={`${id}-${name}`}
        value={fields[name]}
        autoComplete={opts.autoComplete}
        inputMode={opts.inputMode}
        aria-invalid={error?.field === name ? true : undefined}
        aria-describedby={error?.field === name ? `${id}-err` : undefined}
        onChange={(e) => setFields((f) => ({ ...f, [name]: e.target.value }))}
      />
    </div>
  );

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
        <h2 id={`${id}-title`}>{address === "new" ? "Add an address" : "Edit address"}</h2>
        {input("label", "Name for this address, e.g. Home or Work", { optional: true })}
        {input("recipient", "Full name of the recipient", { autoComplete: "name" })}
        {input("phone", "Contact number", { autoComplete: "tel", inputMode: "tel" })}
        {input("line1", "House number and street", { autoComplete: "address-line1" })}
        {input("barangay", "Barangay", { optional: true })}
        {input("city", "City or municipality", { autoComplete: "address-level2" })}
        {input("province", "Province", { optional: true, autoComplete: "address-level1" })}
        {input("postalCode", "ZIP code", { optional: true, autoComplete: "postal-code", inputMode: "numeric" })}
        <div className="field field--check">
          <input id={`${id}-default`} type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
          <label htmlFor={`${id}-default`}>Use as my default delivery address</label>
        </div>
        {error ? (
          <p className="form-error" id={`${id}-err`} role="alert">
            {error.text}
          </p>
        ) : null}
        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Saving…" : "Save address"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

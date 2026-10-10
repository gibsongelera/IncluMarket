"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createDiscountRule,
  deleteDiscountRule,
  disableDiscountRule,
  enableDiscountRule,
  type DiscountRuleInput,
} from "@/lib/actions/admin-discounts";
import type { DiscountRuleAdminLite } from "@/lib/data";
import type { Category } from "@/lib/types";
import { formatDate, money } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { TableWrap } from "./TableWrap";

const TYPE_TEXT: Record<DiscountRuleAdminLite["ruleType"], string> = {
  statutory_20: "Statutory 20% (RA 10754)",
  bnpc_5: "BNPC 5% with weekly limit (JMC 01-2022)",
  voluntary: "Voluntary promotion",
};

export function AdminDiscountsClient({ rules, categories }: { rules: DiscountRuleAdminLite[]; categories: Category[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [enabling, setEnabling] = useState<DiscountRuleAdminLite | null>(null);
  const [deleting, setDeleting] = useState<DiscountRuleAdminLite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.label ?? id ?? "";

  async function turnOff(r: DiscountRuleAdminLite) {
    setBusy(true);
    const res = await disableDiscountRule(r.id);
    setBusy(false);
    if (!res.ok) return toast(res.error || "Could not turn it off.", "error");
    toast(`“${r.name}” is off. Prices go back on the next page load.`, "success");
    router.refresh();
  }

  return (
    <>
      <p>
        <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
          New rule
        </button>
      </p>

      {rules.length === 0 ? (
        <p className="empty">No rules yet. Without an enabled rule, no PWD discount appears anywhere.</p>
      ) : (
        <TableWrap label="Discount rules">
          <table className="data-table data-table--cards">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Applies to</th>
                <th>Legal basis</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    <div className="small">{TYPE_TEXT[r.ruleType]}</div>
                    <div className="small muted">
                      {r.ratePercent}% off{r.vatExempt ? ", VAT-exempt" : ""}
                      {r.weeklyPurchaseCap ? `, on up to ${money(r.weeklyPurchaseCap)} of purchases a week` : ""} ·
                      funded by the {r.fundedBy}
                    </div>
                  </td>
                  <td>{r.productId ? `Product: ${r.productTitle ?? `#${r.productId}`}` : `Category: ${catName(r.categoryId)}`}</td>
                  <td>{r.legalBasis}</td>
                  <td>
                    <span className={`pill pill--${r.enabled ? "approved" : "cancelled"}`}>{r.enabled ? "On" : "Off"}</span>
                    {r.enabled && r.signoffAt ? (
                      <div className="small muted">
                        Signed off {formatDate(r.signoffAt)}
                        {r.signoffBy ? ` by ${r.signoffBy}` : ""}: {r.signoffNote}
                      </div>
                    ) : null}
                    {r.usedOnLines ? <div className="small muted">Used on {r.usedOnLines} order line(s)</div> : null}
                  </td>
                  <td>
                    {r.enabled ? (
                      <button type="button" className="btn btn--outline btn--sm" onClick={() => turnOff(r)} disabled={busy}>
                        Turn off
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          onClick={() => {
                            setError(null);
                            setEnabling(r);
                          }}
                        >
                          Turn on…
                        </button>{" "}
                        {r.usedOnLines ? null : (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => {
                              setError(null);
                              setDeleting(r);
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      <ConfirmDialog
        open={Boolean(enabling)}
        title={`Turn on “${enabling?.name ?? ""}”?`}
        confirmLabel="Turn on"
        busy={busy}
        error={error}
        reason={{
          label: "Legal sign-off (who confirmed, when, reference)",
          required: true,
          minLength: 5,
          hint: "Required. For example: “Atty. R. Cruz confirmed by letter dated 12 Oct 2026, ref. 2026-114.”",
        }}
        onCancel={() => setEnabling(null)}
        onConfirm={async (note) => {
          if (!enabling) return;
          setBusy(true);
          const res = await enableDiscountRule(enabling.id, note);
          setBusy(false);
          if (!res.ok) return setError(res.error || "Could not turn it on.");
          setEnabling(null);
          toast("Rule is on. Verified PWD buyers see it at the next cart or checkout.", "success");
          router.refresh();
        }}
      >
        <p>
          Turn a rule on only after a lawyer confirmed it applies to these items. Verified PWD buyers will see the
          discount in the cart and at checkout, with this rule&rsquo;s legal basis. The sign-off is recorded on the rule
          and in the audit log.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete “${deleting?.name ?? ""}”?`}
        confirmLabel="Delete rule"
        tone="danger"
        busy={busy}
        error={error}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          const res = await deleteDiscountRule(deleting.id);
          setBusy(false);
          if (!res.ok) return setError(res.error || "Could not delete it.");
          setDeleting(null);
          toast("Rule deleted.", "success");
          router.refresh();
        }}
      >
        <p>It has never been used on an order.</p>
      </ConfirmDialog>

      <NewRuleDialog
        open={creating}
        categories={categories}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          router.refresh();
        }}
      />
    </>
  );
}

function NewRuleDialog({
  open,
  categories,
  onClose,
  onCreated,
}: {
  open: boolean;
  categories: Category[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const blank = {
    name: "",
    ruleType: "voluntary" as DiscountRuleInput["ruleType"],
    ratePercent: "10",
    vatExempt: false,
    weeklyPurchaseCap: "",
    target: "category" as "category" | "product",
    categoryId: categories[0]?.id ?? "",
    productId: "",
    fundedBy: "seller" as "seller" | "platform",
    legalBasis: "Voluntary PWD promotion",
  };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      setF(blank);
      setError(null);
      dlg.showModal();
    } else if (!open && dlg.open) dlg.close();
    // blank is rebuilt each render; read only when opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function setType(t: DiscountRuleInput["ruleType"]) {
    setF((x) => ({
      ...x,
      ruleType: t,
      ratePercent: t === "statutory_20" ? "20" : t === "bnpc_5" ? "5" : x.ratePercent,
      vatExempt: t === "statutory_20",
      weeklyPurchaseCap: t === "bnpc_5" ? "1300" : t === "statutory_20" ? "" : x.weeklyPurchaseCap,
      legalBasis: t === "statutory_20" ? "RA 10754" : t === "bnpc_5" ? "DTI-DA JMC 01-2022" : x.legalBasis,
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createDiscountRule({
      name: f.name,
      ruleType: f.ruleType,
      ratePercent: Number(f.ratePercent),
      vatExempt: f.vatExempt,
      weeklyPurchaseCap: f.weeklyPurchaseCap === "" ? null : Number(f.weeklyPurchaseCap),
      categoryId: f.target === "category" ? f.categoryId : null,
      productId: f.target === "product" ? Number(f.productId) : null,
      fundedBy: f.fundedBy,
      legalBasis: f.legalBasis,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error || "Could not create the rule.");
    toast("Rule created. It is off until you turn it on with a legal sign-off.", "success");
    onCreated();
  }

  const fixedRate = f.ruleType !== "voluntary";
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
        <h2 id={`${id}-title`}>New discount rule</h2>
        <p className="hint">New rules start off. Nothing changes for buyers until a rule is turned on with a legal sign-off.</p>
        <div className="field">
          <label htmlFor={`${id}-name`}>Name</label>
          <input id={`${id}-name`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-type`}>Type</label>
          <select id={`${id}-type`} value={f.ruleType} onChange={(e) => setType(e.target.value as DiscountRuleInput["ruleType"])}>
            <option value="voluntary">{TYPE_TEXT.voluntary}</option>
            <option value="statutory_20">{TYPE_TEXT.statutory_20}</option>
            <option value="bnpc_5">{TYPE_TEXT.bnpc_5}</option>
          </select>
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor={`${id}-rate`}>Discount (%)</label>
            <input
              id={`${id}-rate`}
              type="number"
              min={1}
              max={50}
              value={f.ratePercent}
              disabled={fixedRate}
              aria-describedby={fixedRate ? `${id}-rate-hint` : undefined}
              onChange={(e) => setF({ ...f, ratePercent: e.target.value })}
            />
            {fixedRate ? (
              <p className="hint" id={`${id}-rate-hint`}>
                Set by law for this type.
              </p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor={`${id}-cap`}>Weekly purchase limit (₱)</label>
            <input
              id={`${id}-cap`}
              type="number"
              min={1}
              value={f.weeklyPurchaseCap}
              disabled={f.ruleType === "statutory_20"}
              onChange={(e) => setF({ ...f, weeklyPurchaseCap: e.target.value })}
              aria-describedby={`${id}-cap-hint`}
            />
            <p className="hint" id={`${id}-cap-hint`}>
              Purchases per buyer per week that earn the discount. Required for BNPC (₱1,300).
            </p>
          </div>
        </div>
        {f.ruleType === "statutory_20" ? <p className="hint">VAT exemption is applied before the 20% (RA 10754).</p> : null}
        <fieldset className="radio-group">
          <legend>Applies to</legend>
          <label className="radio">
            <input type="radio" name="target" checked={f.target === "category"} onChange={() => setF({ ...f, target: "category" })} />
            A category
          </label>
          <label className="radio">
            <input type="radio" name="target" checked={f.target === "product"} onChange={() => setF({ ...f, target: "product" })} />
            One product
          </label>
        </fieldset>
        {f.target === "category" ? (
          <div className="field">
            <label htmlFor={`${id}-cat`}>Category</label>
            <select id={`${id}-cat`} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="field">
            <label htmlFor={`${id}-prod`}>Product number</label>
            <input id={`${id}-prod`} type="number" min={1} value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })} />
            <p className="hint">The number in the product&rsquo;s address, e.g. 12 in /buyer/product/12.</p>
          </div>
        )}
        <div className="field">
          <label htmlFor={`${id}-fund`}>Who pays for the discount</label>
          <select id={`${id}-fund`} value={f.fundedBy} onChange={(e) => setF({ ...f, fundedBy: e.target.value as "seller" | "platform" })}>
            <option value="seller">The seller</option>
            <option value="platform">InclusiveMarket</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-basis`}>Legal basis (buyers see this)</label>
          <input id={`${id}-basis`} value={f.legalBasis} onChange={(e) => setF({ ...f, legalBasis: e.target.value })} />
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
            {busy ? "Creating…" : "Create rule (off)"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

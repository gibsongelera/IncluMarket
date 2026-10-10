"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  decideVerification,
  resolveVerificationFlag,
  revealVerificationNumber,
  revokeVerification,
  verifyInPerson,
  viewVerificationImages,
} from "@/lib/actions/admin-verification";
import type {
  AdminVerificationLite,
  AdminVerificationView,
  UnverifiedSellerLite,
  VerificationFlagLite,
} from "@/lib/pwd/admin-data";
import { DOH_REGISTRY_URL, REJECT_REASONS, maskPwdId } from "@/lib/pwd/id-number";
import { formatDate, formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { TableWrap } from "./TableWrap";

const STATUS_TEXT: Record<string, string> = {
  submitted: "To review",
  approved: "Approved",
  rejected: "Rejected",
  revoked: "Revoked",
  expired: "Expired",
};

const SIDE_TEXT = { front: "Front of the ID", back: "Back of the ID", selfie: "Holder with the ID" } as const;

export function AdminVerificationsClient({
  view,
  rows,
  sellers,
  flags,
}: {
  view: AdminVerificationView;
  rows: AdminVerificationLite[];
  sellers: UnverifiedSellerLite[];
  flags: VerificationFlagLite[];
}) {
  const router = useRouter();
  const [reviewing, setReviewing] = useState<AdminVerificationLite | null>(null);
  const [revoking, setRevoking] = useState<AdminVerificationLite | null>(null);
  const [inPerson, setInPerson] = useState<UnverifiedSellerLite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolveFlag(id: number) {
    setBusy(true);
    const res = await resolveVerificationFlag(id);
    setBusy(false);
    if (!res.ok) return toast(res.error || "Could not update the flag.", "error");
    toast("Flag marked resolved.", "success");
    router.refresh();
  }

  if (view === "flags") {
    if (!flags.length) return <p className="empty">No open flags. Duplicate ID numbers that are blocked show up here.</p>;
    return (
      <TableWrap label="Verification flags">
        <table className="data-table data-table--cards">
          <thead>
            <tr>
              <th>When</th>
              <th>Account</th>
              <th>What happened</th>
              <th>Number already on</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {flags.map((f) => (
              <tr key={f.id}>
                <td>{formatDateTime(f.createdAt)}</td>
                <td>{f.name}</td>
                <td>
                  <span className="pill pill--flagged">{f.kind === "duplicate_id" ? "Duplicate ID number" : f.kind}</span>
                  {f.note ? <div className="small">{f.note}</div> : null}
                </td>
                <td>{f.existingOwnerName ?? "—"}</td>
                <td>
                  <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => resolveFlag(f.id)}>
                    Mark resolved
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    );
  }

  if (view === "sellers") {
    return (
      <>
        <p className="lede">
          Sellers who are not verified yet. Their listings stay in the shop until the grace date, then are hidden until
          they are verified. Ask them to send their ID from their account, or record an in-person check at AVRC.
        </p>
        {!sellers.length ? (
          <p className="empty">Every active seller is verified.</p>
        ) : (
          <TableWrap label="Unverified sellers">
            <table className="data-table data-table--cards">
              <thead>
                <tr>
                  <th>Seller</th>
                  <th>Live listings</th>
                  <th>Listings visible until</th>
                  <th>ID sent</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => {
                  const graceActive = s.graceUntil && Date.parse(s.graceUntil) > Date.now();
                  return (
                    <tr key={s.profileId}>
                      <td>{s.name}</td>
                      <td>{s.listings}</td>
                      <td>{graceActive ? formatDate(s.graceUntil) : <strong>Hidden now</strong>}</td>
                      <td>{s.pending ? "Yes — in the review queue" : "No"}</td>
                      <td>
                        <button type="button" className="btn btn--outline btn--sm" onClick={() => setInPerson(s)}>
                          Verify in person
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
        <InPersonDialog seller={inPerson} onClose={() => setInPerson(null)} onDone={() => router.refresh()} />
      </>
    );
  }

  if (!rows.length) {
    return (
      <p className="empty">
        {view === "queue" ? "Nothing to review. New submissions appear here, oldest first." : "No decisions yet."}
      </p>
    );
  }

  return (
    <>
      <TableWrap label={view === "queue" ? "IDs to review" : "Decided verifications"}>
        <table className="data-table data-table--cards">
          <thead>
            <tr>
              <th>Person</th>
              <th>PWD ID</th>
              <th>Expires</th>
              <th>{view === "queue" ? "Sent" : "Decided"}</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-row-id={r.id}>
                <td>
                  <strong>{r.name}</strong>
                  <div className="small muted">
                    {r.role === "seller" ? "Seller" : r.role === "buyer" ? "Buyer" : r.role}
                    {r.priorCount ? ` · ${r.priorCount} earlier attempt${r.priorCount === 1 ? "" : "s"}` : ""}
                  </div>
                  {r.openFlags ? <div className="small field-error">Has {r.openFlags} open duplicate-number flag{r.openFlags === 1 ? "" : "s"}</div> : null}
                </td>
                <td>
                  {r.method === "avrc_in_person" ? "Seen in person at AVRC" : <span className="mono">{maskPwdId(r.last4)}</span>}
                  {r.issuingLgu ? <div className="small muted">{r.issuingLgu}</div> : null}
                </td>
                <td>
                  {r.expiresOn ? formatDate(r.expiresOn) : "—"}
                  {r.expired ? <div className="small field-error">Expired</div> : null}
                </td>
                <td>{formatDate(view === "queue" ? r.submittedAt : r.reviewedAt ?? r.submittedAt)}</td>
                <td>
                  <span className={`pill pill--${r.status}`}>{STATUS_TEXT[r.status] ?? r.status}</span>
                  {r.reviewerName ? <div className="small muted">by {r.reviewerName}</div> : null}
                  {r.reasonLabel ? <div className="small">{r.reasonLabel}</div> : null}
                  {r.revokeReason ? <div className="small">{r.revokeReason}</div> : null}
                </td>
                <td>
                  {r.status === "submitted" ? (
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => setReviewing(r)}>
                      Review
                    </button>
                  ) : r.status === "approved" && !r.expired ? (
                    <button type="button" className="btn btn--outline btn--sm" onClick={() => { setError(null); setRevoking(r); }}>
                      Revoke
                    </button>
                  ) : (
                    <span className="muted small">No action</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <ReviewDialog item={reviewing} onClose={() => setReviewing(null)} onDone={() => router.refresh()} />

      <ConfirmDialog
        open={Boolean(revoking)}
        title={`Revoke ${revoking?.name ?? ""}'s verification?`}
        confirmLabel="Revoke verification"
        tone="danger"
        busy={busy}
        error={error}
        reason={{
          label: "Reason (the person will read this)",
          required: true,
          minLength: 5,
          hint: "For example: the ID was reported lost and reissued with a new number.",
        }}
        onCancel={() => setRevoking(null)}
        onConfirm={async (why) => {
          if (!revoking) return;
          setBusy(true);
          const res = await revokeVerification(revoking.id, why);
          setBusy(false);
          if (!res.ok) return setError(res.error || "Could not revoke.");
          setRevoking(null);
          toast("Verification revoked. The person has been told.", "success");
          router.refresh();
        }}
      >
        <p>
          They lose the verified badge{revoking?.role === "seller" ? ", and their listings leave the shop," : ""} and any PWD
          discount on their next visit. They can send their ID again.
        </p>
      </ConfirmDialog>
    </>
  );
}

function useDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    else if (!open && dlg.open) dlg.close();
  }, [open]);
  return ref;
}

function ReviewDialog({
  item,
  onClose,
  onDone,
}: {
  item: AdminVerificationLite | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const id = useId();
  const ref = useDialog(Boolean(item));
  const [images, setImages] = useState<{ side: keyof typeof SIDE_TEXT; url: string }[] | null>(null);
  const [number, setNumber] = useState<string | null>(null);
  const [registry, setRegistry] = useState("not_checked");
  const [registryNote, setRegistryNote] = useState("");
  const [decision, setDecision] = useState<"approved" | "rejected" | "">("");
  const [reasonCode, setReasonCode] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fresh state for every person reviewed; nothing carries over.
    setImages(null);
    setNumber(null);
    setRegistry("not_checked");
    setRegistryNote("");
    setDecision("");
    setReasonCode("");
    setReason("");
    setError(null);
  }, [item?.id]);

  if (!item) return <dialog ref={ref} className="modal modal--wide" aria-label="Review PWD ID" />;

  async function showImages() {
    setError(null);
    setBusy(true);
    const res = await viewVerificationImages(item!.id);
    setBusy(false);
    if (!res.ok) return setError(res.error || "Could not open the photos.");
    setImages(res.images ?? []);
  }

  async function showNumber() {
    setError(null);
    setBusy(true);
    const res = await revealVerificationNumber(item!.id);
    setBusy(false);
    if (!res.ok) return setError(res.error || "Could not show the number.");
    setNumber(res.number ?? null);
  }

  async function copyNumber() {
    if (!number) return;
    try {
      await navigator.clipboard.writeText(number);
      toast("Number copied. Paste it into the DOH registry search.", "info");
    } catch {
      toast("Copy did not work — select the number and copy it by hand.", "warning");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!decision) return setError("Choose approve or reject.");
    if (decision === "rejected" && !reasonCode) return setError("Choose a reason for rejecting.");
    setBusy(true);
    const res = await decideVerification(item!.id, decision, { reasonCode, reason, registryResult: registry, registryNote });
    setBusy(false);
    if (!res.ok) return setError(res.error || "Could not save the decision.");
    toast(decision === "approved" ? "Approved. The person has been told." : "Rejected. The person has been told why.", "success");
    onClose();
    onDone();
  }

  return (
    <dialog
      ref={ref}
      className="modal modal--wide"
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form className="modal-form" onSubmit={save} noValidate>
        <h2 id={`${id}-title`}>Review: {item.name}</h2>

        <dl className="details-list">
          <dt>Account</dt>
          <dd>{item.role === "seller" ? "Seller" : "Buyer"}{item.priorCount ? ` · ${item.priorCount} earlier attempt(s)` : ""}</dd>
          <dt>PWD ID</dt>
          <dd className="mono">{number ?? maskPwdId(item.last4)}</dd>
          <dt>Issuing office</dt>
          <dd>{item.issuingLgu ?? "—"}</dd>
          <dt>Expires</dt>
          <dd>
            {item.expiresOn ? formatDate(item.expiresOn) : "—"}
            {item.expired ? <strong> — expired since it was sent</strong> : null}
          </dd>
          <dt>Sent</dt>
          <dd>{formatDateTime(item.submittedAt)}</dd>
        </dl>
        {item.openFlags ? (
          <p className="notice notice--warning">
            This account has {item.openFlags} open duplicate-number flag{item.openFlags === 1 ? "" : "s"}. Check the Flags tab
            before approving.
          </p>
        ) : null}

        <section className="review-block" aria-labelledby={`${id}-photos`}>
          <h3 id={`${id}-photos`}>1. Look at the photos</h3>
          {images ? (
            <>
              <p className="hint">Opened through links that expire in 60 seconds. This view is logged.</p>
              <ul className="review-photos review-photos--large">
                {images.map((img) => (
                  <li key={img.side}>
                    <a href={img.url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                      <img src={img.url} alt={SIDE_TEXT[img.side]} />
                    </a>
                    <span>{SIDE_TEXT[img.side]}</span>
                  </li>
                ))}
              </ul>
              <p className="hint">Compare the face in the selfie with the photo on the ID, by eye.</p>
            </>
          ) : item.hasImages ? (
            <p>
              <button type="button" className="btn btn--outline" onClick={showImages} disabled={busy}>
                Show ID photos
              </button>
            </p>
          ) : (
            <p>No photos are held for this record.</p>
          )}
        </section>

        <section className="review-block" aria-labelledby={`${id}-registry`}>
          <h3 id={`${id}-registry`}>2. Check the DOH registry</h3>
          <p className="hint">
            The registry has no API, so this check is by hand. &ldquo;No records found&rdquo; does not prove an ID is fake —
            the issuing office may not have uploaded it yet.
          </p>
          <div className="form-actions form-actions--start">
            {number ? (
              <button type="button" className="btn btn--outline" onClick={copyNumber}>
                Copy the number
              </button>
            ) : item.canRevealNumber ? (
              <button type="button" className="btn btn--outline" onClick={showNumber} disabled={busy}>
                Show the full number
              </button>
            ) : null}
            <a className="btn btn--outline" href={DOH_REGISTRY_URL} target="_blank" rel="noopener noreferrer">
              Open the DOH registry<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
          <fieldset className="radio-group">
            <legend>What did the registry show?</legend>
            {[
              ["found", "Listed in the registry"],
              ["not_found", "No record found"],
              ["not_checked", "Not checked"],
            ].map(([value, label]) => (
              <label key={value} className="radio">
                <input type="radio" name="registry" value={value} checked={registry === value} onChange={() => setRegistry(value)} />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor={`${id}-rnote`}>Registry note (optional)</label>
            <textarea id={`${id}-rnote`} rows={2} maxLength={500} value={registryNote} onChange={(e) => setRegistryNote(e.target.value)} />
          </div>
        </section>

        <section className="review-block" aria-labelledby={`${id}-decide`}>
          <h3 id={`${id}-decide`}>3. Decide</h3>
          <fieldset className="radio-group">
            <legend>Decision</legend>
            <label className="radio">
              <input type="radio" name="decision" value="approved" checked={decision === "approved"} onChange={() => setDecision("approved")} />
              Approve — this is a valid PWD ID and the holder matches
            </label>
            <label className="radio">
              <input type="radio" name="decision" value="rejected" checked={decision === "rejected"} onChange={() => setDecision("rejected")} />
              Reject
            </label>
          </fieldset>
          {decision === "rejected" ? (
            <>
              <div className="field">
                <label htmlFor={`${id}-reason`}>Reason</label>
                <select id={`${id}-reason`} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                  <option value="">Choose a reason…</option>
                  {REJECT_REASONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${id}-why`}>
                  Message to the person {reasonCode === "other" ? "(required)" : "(optional)"}
                </label>
                <textarea id={`${id}-why`} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
                <p className="hint">Say what to do next, for example &ldquo;Retake the back of the ID in brighter light.&rdquo;</p>
              </div>
            </>
          ) : null}
        </section>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className={`btn ${decision === "rejected" ? "btn--danger" : "btn--primary"}`} disabled={busy || !decision}>
            {busy ? "Working…" : decision === "rejected" ? "Reject" : "Approve"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function InPersonDialog({
  seller,
  onClose,
  onDone,
}: {
  seller: UnverifiedSellerLite | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const id = useId();
  const ref = useDialog(Boolean(seller));
  const [form, setForm] = useState({ idNumber: "", issuingLgu: "", expiresOn: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({ idNumber: "", issuingLgu: "", expiresOn: "", note: "" });
    setError(null);
  }, [seller?.profileId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!seller) return;
    setBusy(true);
    setError(null);
    const res = await verifyInPerson(seller.profileId, form);
    setBusy(false);
    if (!res.ok) return setError(res.error || "Could not save.");
    toast(`${seller.name} is verified. They have been told.`, "success");
    onClose();
    onDone();
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

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
      <form className="modal-form" onSubmit={save} noValidate>
        <h2 id={`${id}-title`}>Verify {seller?.name ?? ""} in person</h2>
        <p>
          Use this only when you have seen this seller&rsquo;s PWD ID yourself at AVRC. Type the details from the card;
          no photos are stored.
        </p>
        <div className="field">
          <label htmlFor={`${id}-num`}>PWD ID number</label>
          <input id={`${id}-num`} inputMode="numeric" autoComplete="off" value={form.idNumber} onChange={set("idNumber")} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-lgu`}>Issuing office</label>
          <input id={`${id}-lgu`} autoComplete="off" value={form.issuingLgu} onChange={set("issuingLgu")} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-exp`}>Expiry date</label>
          <input id={`${id}-exp`} type="date" value={form.expiresOn} onChange={set("expiresOn")} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-note`}>Where and when you saw it</label>
          <textarea id={`${id}-note`} rows={2} maxLength={500} value={form.note} onChange={set("note")} />
          <p className="hint">For example: &ldquo;Seen at AVRC Zamboanga on 12 Oct 2026; matches the holder.&rdquo;</p>
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
            {busy ? "Working…" : "Mark verified"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

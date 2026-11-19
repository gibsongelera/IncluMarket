"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setReviewHidden } from "@/lib/actions/admin-content";
import type { AdminReview } from "@/lib/admin-content";
import { formatDate, formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "./ConfirmDialog";

const HIDE_REASONS = [
  "Abusive or hateful language",
  "Shares personal details",
  "Spam or advertising",
  "Not about this product",
];

/** Admin → Reviews (C-40). */
export function AdminReviewsClient({ reviews }: { reviews: AdminReview[] }) {
  const router = useRouter();
  const [hiding, setHiding] = useState<AdminReview | null>(null);
  const [preset, setPreset] = useState(HIDE_REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore(r: AdminReview) {
    setBusy(true);
    const res = await setReviewHidden(r.id, false, "");
    setBusy(false);
    if (!res.ok) return toast(res.error || "Could not show it again.", "error");
    toast("The review is visible again.", "success");
    router.refresh();
  }

  if (!reviews.length) return <p className="empty">No reviews here.</p>;

  return (
    <>
      <ul className="review-admin-list" role="list">
        {reviews.map((r) => (
          <li key={r.id} className="card review-admin" data-row-id={r.id}>
            <p className="review-admin__head">
              <strong>
                <span aria-hidden="true">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                <span className="sr-only">{r.rating} out of 5 stars</span>
              </strong>{" "}
              on <a href={`/buyer/product/${r.productId}`}>{r.productTitle}</a>
            </p>
            <p className="small muted">
              {r.reviewer} · {formatDate(r.createdAt)}
            </p>
            {r.comment ? <p className="review-admin__text">{r.comment}</p> : <p className="muted small">No written review.</p>}
            {r.sellerReply ? <p className="small">Seller replied: {r.sellerReply}</p> : null}
            {r.hidden ? (
              <p className="small">
                <span className="pill pill--flagged">Hidden</span> {r.hiddenReason}
                {r.hiddenAt ? <span className="muted"> · {formatDateTime(r.hiddenAt)}</span> : null}
              </p>
            ) : null}
            <p>
              {r.hidden ? (
                <button type="button" className="btn btn--outline btn--sm" onClick={() => restore(r)} disabled={busy}>
                  Show again
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setError(null);
                    setPreset(HIDE_REASONS[0]);
                    setHiding(r);
                  }}
                  disabled={busy}
                >
                  Hide…
                </button>
              )}
            </p>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={Boolean(hiding)}
        title="Hide this review?"
        confirmLabel="Hide review"
        tone="danger"
        busy={busy}
        error={error}
        reason={{ label: "Note for the reviewer (optional)", maxLength: 200 }}
        onCancel={() => setHiding(null)}
        onConfirm={async (note) => {
          if (!hiding) return;
          setBusy(true);
          const res = await setReviewHidden(hiding.id, true, note ? `${preset}: ${note}` : preset);
          setBusy(false);
          if (!res.ok) return setError(res.error || "Could not hide it.");
          setHiding(null);
          toast("Review hidden. The reviewer has been told why.", "success");
          router.refresh();
        }}
      >
        <div className="field">
          <label htmlFor="hide-reason">Reason</label>
          <select id="hide-reason" value={preset} onChange={(e) => setPreset(e.target.value)}>
            {HIDE_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
      </ConfirmDialog>
    </>
  );
}

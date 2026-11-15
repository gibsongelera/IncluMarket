"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setProductFeatured, setProductStatus } from "@/lib/actions/admin";
import type { AdminProductRow } from "@/lib/admin-list-types";
import { formatDate, money, productImageSrc } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { ProductStatus } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { DeepLinkFocus } from "./DeepLinkFocus";
import { FeatureDialog, featureState } from "./FeatureDialog";
import { Icon } from "./Icon";
import { Pill } from "./Pill";
import { RowActions } from "./RowActions";
import { TableWrap } from "./TableWrap";
import { useRowFocus } from "./useRowFocus";

/** Common reasons, so sellers get consistent, actionable feedback (C-39). */
const FLAG_REASONS = [
  "The photos are unclear or missing",
  "The description is incomplete or does not match the item",
  "The price looks wrong",
  "It is in the wrong category",
  "This item cannot be sold on InclusiveMarket",
  "It does not look made by the seller",
  "Another reason",
];

/** An empty list's sentence, and a link out of it when there is one. */
export interface ProductsEmpty {
  text: string;
  href?: string;
  action?: string;
}

/**
 * Admin → Products (P2-08, 03 §6): one page of listings, with the review
 * decisions and the homepage feature in each row's Actions. The page filters,
 * searches and pages on the server; the rows carry the seller's shop name and
 * the category's label, and no contact details.
 */
export function AdminProductsClient({ rows, empty }: { rows: AdminProductRow[]; empty: ProductsEmpty }) {
  const router = useRouter();
  const [flagging, setFlagging] = useState<AdminProductRow | null>(null);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState(FLAG_REASONS[0]);
  const [featuring, setFeaturing] = useState<AdminProductRow | null>(null);
  const [busy, setBusy] = useState(false);

  // Where focus goes when a decision takes the row off this tab.
  const focus = useRowFocus(rows);

  async function decide(id: number, status: ProductStatus, msg: string, kind: "success" | "warning", reason?: string) {
    // Before the await: the refreshed rows can land before it resolves.
    focus.mark(id);
    setBusy(true);
    const res = await setProductStatus(id, status, reason);
    setBusy(false);
    if (!res.ok) {
      focus.clear();
      if (flagging) setFlagError(res.error || "Could not update.");
      else toast(res.error || "Could not update.", "error");
      return;
    }
    setFlagging(null);
    toast(msg, kind);
    router.refresh();
  }

  function openFlag(p: AdminProductRow) {
    setFlagError(null);
    setFlagReason(FLAG_REASONS[0]);
    setFlagging(p);
  }

  // DeepLinkFocus stays on an empty list too: it moves focus to the page's
  // "not in this list" note when ?focus= names a listing that is not here.
  if (!rows.length) {
    return (
      <>
        <DeepLinkFocus />
        <div className="empty">
          {/* Focus lands on the sentence after a decision empties the
              list: it says why, which the link alone would skip. */}
          <p ref={focus.emptyRef} tabIndex={-1}>
            {empty.text}
          </p>
          {empty.href && empty.action ? (
            <Link className="btn btn--outline" href={empty.href}>
              {empty.action}
            </Link>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      <DeepLinkFocus />
      <TableWrap label="Listings">
        <table className="data-table data-table--cards" aria-label="Listings, newest first">
          <thead>
            <tr>
              <th scope="col">Listing</th>
              <th scope="col">Seller</th>
              <th scope="col">Category</th>
              <th scope="col" className="num">
                Price
              </th>
              <th scope="col">Status</th>
              <th scope="col">Featured</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const status = p.status || "pending";
              // Flagging or re-queuing keeps the feature, but the homepage
              // shows approved listings only.
              const state = p.is_featured && status !== "approved" ? "Hidden until approved" : featureState(p);
              const stateText =
                state === "Starts later" && p.featured_from ? `Starts ${formatDate(p.featured_from)}` : state;
              return (
                <tr key={p.id} data-row-id={p.id}>
                  <td>
                    <div className="cell-identity">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="cell-identity__thumb" src={productImageSrc(p, 0)} alt="" decoding="async" />
                      <span className="cell-identity__text">
                        <span className="cell-identity__name">{p.title}</span>
                        <span className="cell-identity__meta">
                          <span className="cell-code">#{p.id}</span>
                        </span>
                        {p.excerpt ? <span className="cell-identity__meta">{p.excerpt}</span> : null}
                        {/* How many photos, in words: alt="" on the pictures
                            themselves (the title names the listing), and
                            the thumbnail is the first, so the strip shows
                            the next ones. */}
                        <span className="cell-identity__meta">
                          {p.photoCount
                            ? `${p.photoCount} photo${p.photoCount === 1 ? "" : "s"}`
                            : "No photos: buyers see an illustration"}
                        </span>
                        {p.images.length > 1 ? (
                          <span className="cell-thumb-strip">
                            {p.images.slice(1).map((src, i) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={i} src={src} alt="" loading="lazy" decoding="async" />
                            ))}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </td>
                  <td>{p.sellerName}</td>
                  <td>{p.categoryLabel}</td>
                  <td className="num">{money(p.base_price)}</td>
                  <td>
                    <Pill status={status} />
                    {status === "flagged" && p.moderationReason ? (
                      <div className="small muted">Reason: {p.moderationReason}</div>
                    ) : null}
                  </td>
                  <td>
                    {p.is_featured ? (
                      <div className="small">
                        <strong>Featured</strong>
                        {p.featured_position != null ? <> · #{p.featured_position}</> : null}
                        {p.featured_until ? <div className="muted">until {formatDate(p.featured_until)}</div> : null}
                        {state !== "live" ? <div className="text-warning">{stateText}</div> : null}
                      </div>
                    ) : status === "approved" ? (
                      <span className="muted small">Not featured</span>
                    ) : (
                      <span className="muted small">Approve first</span>
                    )}
                  </td>
                  <td className="cell-actions">
                    <RowActions label={`listing #${p.id}`}>
                      {/* Keyed by status: a decision that keeps the row here
                          replaces its buttons, so RowActions moves focus to
                          the toggle instead of leaving it on a button that
                          now does something else. */}
                      {status === "pending" ? (
                        <Fragment key="pending">
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            onClick={() => decide(p.id, "approved", "Product approved.", "success")}
                          >
                            Approve
                          </button>{" "}
                          <button type="button" className="btn btn--danger btn--sm" onClick={() => openFlag(p)}>
                            Ask for changes…
                          </button>
                        </Fragment>
                      ) : status === "flagged" ? (
                        <Fragment key="flagged">
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            onClick={() => decide(p.id, "approved", "Product approved.", "success")}
                          >
                            Approve
                          </button>{" "}
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => decide(p.id, "pending", "Re-queued for review.", "success")}
                          >
                            Re-queue
                          </button>
                        </Fragment>
                      ) : status === "archived" ? null : (
                        <Fragment key="approved">
                          <button type="button" className="btn btn--danger btn--sm" onClick={() => openFlag(p)}>
                            Flag…
                          </button>{" "}
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => decide(p.id, "pending", "Re-queued for review.", "success")}
                          >
                            Re-queue
                          </button>
                        </Fragment>
                      )}
                      {status === "approved" || p.is_featured ? (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => setFeaturing(p)}
                          aria-label={`${p.is_featured ? "Edit feature for" : "Feature"} ${p.title}`}
                        >
                          <Icon name="sparkles" size={14} /> {p.is_featured ? "Edit feature…" : "Feature…"}
                        </button>
                      ) : null}
                    </RowActions>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>

      <ConfirmDialog
        open={Boolean(flagging)}
        title={flagging ? `Ask for changes to "${flagging.title}"?` : ""}
        confirmLabel="Send to seller"
        tone="danger"
        busy={busy}
        error={flagError}
        reason={{
          label: "What exactly should change? (optional, the seller sees this)",
          required: flagReason === "Another reason",
          minLength: 5,
          maxLength: 400,
          hint: "For example: the second photo is blurry — retake it in daylight.",
        }}
        onCancel={() => setFlagging(null)}
        onConfirm={(note) => {
          const reason = note ? `${flagReason}: ${note}` : flagReason;
          if (flagging) void decide(flagging.id, "flagged", "Sent back to the seller with your note.", "warning", reason);
        }}
      >
        <p>The listing is hidden from buyers until it is approved again. The seller is notified in the app and by email.</p>
        <div className="field">
          <label htmlFor="flag-reason">Reason</label>
          <select id="flag-reason" value={flagReason} onChange={(e) => setFlagReason(e.target.value)}>
            {FLAG_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </ConfirmDialog>
      <FeatureDialog
        product={featuring}
        onClose={() => setFeaturing(null)}
        onSave={async (featured, win) => {
          if (!featuring) return "Nothing selected.";
          const res = await setProductFeatured(featuring.id, featured, win);
          if (!res.ok) return res.error || "Could not update.";
          toast(featured ? "Feature saved." : "No longer featured.", "success");
          setFeaturing(null);
          router.refresh();
          return null;
        }}
      />
    </>
  );
}

"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate, initials, maskEmail } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  anonymizeUser,
  createUser,
  deleteUser,
  sendPasswordReset,
  setAccountStatus,
  setSellerFeatured,
  updateUser,
  updateUserRole,
} from "@/lib/actions/admin";
import { Icon } from "./Icon";
import { Pill } from "./Pill";
import { ConfirmDialog } from "./ConfirmDialog";
import type { AdminUserRow } from "@/lib/admin-list-types";
import type { Role } from "@/lib/types";
import { TableWrap } from "./TableWrap";
import { DeepLinkFocus } from "./DeepLinkFocus";
import { RowActions } from "./RowActions";
import { useRowFocus } from "./useRowFocus";

type UserRow = AdminUserRow;

/** An empty list's sentence, and a link out of it when there is one. */
export interface UsersEmpty {
  text: string;
  href?: string;
  action?: string;
}

type Pending =
  | { kind: "suspend" | "restore" | "delete" | "anonymize"; user: UserRow }
  | { kind: "role"; user: UserRow; next: Role }
  | { kind: "feature"; user: UserRow };

const ROLES: Role[] = ["buyer", "seller", "admin"];
const s = (n: number) => (n === 1 ? "" : "s");

function hasHistory(u: UserRow): boolean {
  return u.footprint.orders > 0 || u.footprint.products > 0;
}

/**
 * Admin → Users (P2-09, P2-10, 03 §6): one page of accounts (the page
 * filters, searches and pages on the server; the toolbar and notes come in as
 * children, under the head). Each row: the identity cell (initials, name,
 * #id and the masked email, never the full address), the role select, the
 * status with the PWD verification in words, the homepage feature in words,
 * and the governance actions in the row's Actions, each opening its dialog.
 */
export function AdminUsersClient({
  users,
  currentAdminId,
  empty,
  children,
}: {
  users: UserRow[];
  currentAdminId: number;
  empty: UsersEmpty;
  /** The list toolbar and its notes, rendered on the server. */
  children?: ReactNode;
}) {
  const router = useRouter();

  const modalRef = useRef<HTMLDialogElement>(null);
  const detailsRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [detail, setDetail] = useState<UserRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [pending, setPending] = useState<Pending | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);

  // Where focus goes when an action takes the row off this tab once
  // router.refresh() lands: a delete, an anonymise (the name changes, and
  // with it the row's place by name), a role change on a role tab, a
  // suspend or restore on a status tab, an edit that changes the role.
  const focus = useRowFocus(users);

  // form state
  const [fName, setFName] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fRole, setFRole] = useState<Role>("buyer");
  const [fDisability, setFDisability] = useState("");
  const [fNeeds, setFNeeds] = useState("");
  const [fConsent, setFConsent] = useState(false);

  function openCreate() {
    setEditing(null);
    setFName("");
    setFEmail("");
    setFRole("buyer");
    setFDisability("");
    setFNeeds("");
    setFConsent(false);
    setErr(null);
    modalRef.current?.showModal();
  }

  function openEdit(u: UserRow) {
    setEditing(u);
    setFName(u.name || "");
    setFEmail(u.email || "");
    setFRole(u.role);
    setFDisability(u.disability_type || "");
    setFNeeds(u.assistive_needs || "");
    setErr(null);
    modalRef.current?.showModal();
  }

  function openDetails(u: UserRow) {
    setDetail(u);
    detailsRef.current?.showModal();
  }

  function ask(p: Pending) {
    setPendingError(null);
    setPending(p);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const input = {
      name: fName,
      email: fEmail,
      role: fRole,
      disability_type: fDisability || null,
      assistive_needs: fNeeds || null,
    };
    setBusy(true);
    // Before the await: the refreshed rows can land before it resolves.
    if (editing) focus.mark(editing.id);
    const res = editing ? await updateUser(editing.id, input) : await createUser(input, fConsent);
    setBusy(false);
    if (!res.ok) {
      focus.clear();
      setErr(res.error || "Could not save user.");
      return;
    }
    toast(
      editing ? `User "${fName}" updated.` : `Invitation sent to ${fEmail}. They choose their own password.`,
      "success"
    );
    modalRef.current?.close();
    router.refresh();
  }

  async function runPending(reason: string) {
    if (!pending) return;
    const u = pending.user;
    setBusy(true);
    // Before the await: the refreshed rows can land before it resolves.
    focus.mark(u.id);
    let res: { ok: boolean; error?: string };
    let done = "";
    switch (pending.kind) {
      case "suspend":
        res = await setAccountStatus(u.id, "suspended", reason);
        done = `${u.name} is suspended and has been emailed the reason.`;
        break;
      case "restore":
        res = await setAccountStatus(u.id, "active", reason);
        done = `${u.name} can sign in again.`;
        break;
      case "delete":
        res = await deleteUser(u.id);
        done = `${u.name} was deleted.`;
        break;
      case "anonymize":
        res = await anonymizeUser(u.id);
        done = `${u.name}'s personal data was removed. Their orders stay in the records.`;
        break;
      case "role":
        res = await updateUserRole(u.id, pending.next);
        done = `${u.name} is now ${pending.next === "admin" ? "an" : "a"} ${pending.next}.`;
        break;
      case "feature": {
        const next = !u.is_featured_seller;
        res = await setSellerFeatured(u.id, next, next ? reason : undefined);
        done = next ? `${u.name} is now a featured PWD seller.` : `${u.name} was removed from featured sellers.`;
        break;
      }
    }
    setBusy(false);
    if (!res.ok) {
      // A refusal (deleteUser: "Could not check this account's orders and
      // products…") shows in the dialog, which stays open.
      focus.clear();
      setPendingError(res.error || "That did not work. Please try again.");
      return;
    }
    setPending(null);
    toast(done, "success");
    router.refresh();
  }

  const dialog = (() => {
    if (!pending) return null;
    const u = pending.user;
    switch (pending.kind) {
      case "suspend":
        return {
          title: `Suspend ${u.name}?`,
          body: (
            <p>
              They will be signed out and cannot sign in until you restore the account. Their
              listings are hidden from the shop. We email them the reason you give.
            </p>
          ),
          confirm: "Suspend account",
          tone: "danger" as const,
          reason: { label: "Reason (sent to the user)", required: true, minLength: 5, maxLength: 500 },
        };
      case "restore":
        return {
          title: `Restore ${u.name}?`,
          body: <p>They can sign in again and their approved listings return to the shop.</p>,
          confirm: "Restore account",
          tone: "primary" as const,
          reason: { label: "Note for the audit log", required: true, minLength: 5, maxLength: 500 },
        };
      case "delete":
        return {
          title: `Delete ${u.name}?`,
          body: <p>This account has no orders or products. Deleting it removes it and its sign-in permanently.</p>,
          confirm: "Delete permanently",
          tone: "danger" as const,
        };
      case "anonymize":
        return {
          title: `Remove ${u.name}'s personal data?`,
          body: (
            <>
              <p>
                This account has {u.footprint.orders} order{s(u.footprint.orders)} and{" "}
                {u.footprint.products} product{s(u.footprint.products)}, so it cannot be deleted without
                erasing other people&apos;s records.
              </p>
              <p>
                Anonymising replaces the name and email, clears disability and contact details, deletes
                the cart, wishlist and sign-in, and keeps the orders. It cannot be undone.
              </p>
            </>
          ),
          confirm: "Anonymise account",
          tone: "danger" as const,
        };
      case "role":
        return {
          title: `Change ${u.name}'s role?`,
          body: (
            <p>
              From <strong>{u.role}</strong> to <strong>{pending.next}</strong>.
              {pending.next === "admin" ? " Admins can see and change everything." : ""}
            </p>
          ),
          confirm: "Change role",
          tone: pending.next === "admin" ? ("danger" as const) : ("primary" as const),
        };
      case "feature":
        return u.is_featured_seller
          ? {
              title: `Stop featuring ${u.name}?`,
              body: <p>They are removed from the homepage&apos;s featured PWD sellers.</p>,
              confirm: "Stop featuring",
              tone: "primary" as const,
            }
          : {
              title: `Feature ${u.name} as a PWD seller?`,
              body: <p>Their card and story appear on the homepage.</p>,
              confirm: "Feature seller",
              tone: "primary" as const,
              reason: {
                label: "Seller story shown on the homepage",
                required: false,
                maxLength: 600,
                hint: "Two or three sentences, in plain words. You can leave it empty.",
                defaultValue: u.seller_story || "",
              },
            };
    }
  })();

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Users</h1>
          <p className="muted">Every account: roles, access, and the personal data we hold (RA 10173)</p>
        </div>
        <div className="page-head__actions">
          <button type="button" className="btn btn--primary" id="add-user" onClick={openCreate}>
            <Icon name="plus" size={18} /> Invite a user
          </button>
        </div>
      </div>

      {children}

      {/* DeepLinkFocus stays on an empty list too: it moves focus to the
          page's "not in this list" note when ?focus= names an account that
          is not here. */}
      <DeepLinkFocus />
      {users.length === 0 ? (
        <div className="empty">
          {/* Focus lands on the sentence after an action empties the list:
              it says why, which the link alone would skip. */}
          <p ref={focus.emptyRef} tabIndex={-1}>
            {empty.text}
          </p>
          {empty.href && empty.action ? (
            <Link className="btn btn--outline" href={empty.href}>
              {empty.action}
            </Link>
          ) : null}
        </div>
      ) : (
      <TableWrap label="Users">
        <table className="data-table data-table--cards" aria-label="Accounts by name">
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Featured</th>
              <th scope="col">Joined</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody id="user-rows">
            {users.map((u) => {
              const isSelf = u.id === currentAdminId;
              const suspended = u.account_status === "suspended";
              const history = hasHistory(u);
              return (
                <tr key={u.id} data-row-id={u.id}>
                  <td>
                    <div className="cell-identity">
                      <span className="avatar" aria-hidden="true">
                        {initials(u.name)}
                      </span>
                      <span className="cell-identity__text">
                        <span className="cell-identity__name">
                          {u.name}
                          {isSelf ? (
                            <>
                              {" "}
                              <span className="badge badge--yellow">
                                {/* Read as "Admin Account (your account)", not "Admin Account You". */}
                                <span aria-hidden="true">You</span>
                                <span className="sr-only">(your account)</span>
                              </span>
                            </>
                          ) : null}
                        </span>
                        {/* The masked email only (RA 10173): never the full
                            address, as in the details dialog. */}
                        <span className="cell-identity__meta">
                          <span className="cell-code">#{u.id}</span>
                          {u.email ? (
                            <>
                              {" · "}
                              <span title="Email masked for PII protection (RA 10173)">
                                <span className="sr-only">Masked email{" "}</span>
                                {maskEmail(u.email)}
                              </span>
                            </>
                          ) : null}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <select
                      className="role-sel"
                      aria-label={`Change role for ${u.name || "account"} #${u.id}`}
                      value={u.role}
                      disabled={isSelf}
                      onChange={(e) => ask({ kind: "role", user: u, next: e.target.value as Role })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <Pill status={u.account_status} />
                    {u.role !== "admin" && u.verified !== null ? (
                      <div className="small muted">{u.verified ? "Verified PWD" : "Not verified"}</div>
                    ) : null}
                  </td>
                  <td>
                    {u.role === "seller" ? (
                      u.is_featured_seller ? (
                        <strong className="small">Featured</strong>
                      ) : (
                        <span className="muted small">Not featured</span>
                      )
                    ) : (
                      <span className="muted small">Not a seller</span>
                    )}
                  </td>
                  <td>{formatDate(u.created_at)}</td>
                  <td className="cell-actions">
                    <RowActions label={`${u.name || "account"} #${u.id}`}>
                      {/* A button keyed by what it does: an action that keeps
                          the row here (Suspend on All) replaces it, so
                          RowActions moves focus to the toggle instead of
                          leaving it on a button that now does the opposite. */}
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => openDetails(u)}>
                        Details
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEdit(u)}>
                        Edit…
                      </button>
                      {u.role === "seller" ? (
                        <button
                          key={u.is_featured_seller ? "unfeature" : "feature"}
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => ask({ kind: "feature", user: u })}
                        >
                          {u.is_featured_seller ? "Stop featuring…" : "Feature as PWD seller…"}
                        </button>
                      ) : null}
                      {isSelf ? null : (
                        <button
                          key={suspended ? "restore" : "suspend"}
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => ask({ kind: suspended ? "restore" : "suspend", user: u })}
                        >
                          {suspended ? "Restore…" : "Suspend…"}
                        </button>
                      )}
                      {isSelf ? null : (
                        <button
                          key={history ? "anonymize" : "delete"}
                          type="button"
                          className="btn btn--danger btn--sm"
                          onClick={() => ask({ kind: history ? "anonymize" : "delete", user: u })}
                        >
                          {history ? "Anonymise…" : "Delete…"}
                        </button>
                      )}
                    </RowActions>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title={dialog?.title ?? ""}
        confirmLabel={dialog?.confirm ?? "Confirm"}
        tone={dialog?.tone}
        busy={busy}
        error={pendingError}
        reason={dialog && "reason" in dialog ? dialog.reason : undefined}
        onConfirm={runPending}
        onCancel={() => {
          setPending(null);
          router.refresh(); // resets a role <select> the dialog was opened from
        }}
      >
        {dialog?.body}
      </ConfirmDialog>

      <dialog id="user-modal" className="modal modal--wide" ref={modalRef} aria-labelledby="um-title">
        <form className="modal-form" id="user-form" noValidate onSubmit={save}>
          <h2 id="um-title">{editing ? `Edit user #${editing.id}` : "Invite a new user"}</h2>
          {!editing ? (
            <p className="hint">
              We email an invitation. The person sets their own password — no administrator ever
              handles it.
            </p>
          ) : null}
          <div className="row">
            <div className="field">
              <label htmlFor="um-name">
                Full name <span aria-hidden="true" className="req">*</span>
              </label>
              <input id="um-name" required maxLength={120} value={fName} onChange={(e) => setFName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="um-email">
                Email <span aria-hidden="true" className="req">*</span>
              </label>
              <input
                id="um-email"
                type="email"
                required
                autoComplete="off"
                value={fEmail}
                onChange={(e) => setFEmail(e.target.value)}
                aria-describedby={editing ? "um-email-hint" : undefined}
              />
              {editing ? (
                <p id="um-email-hint" className="hint">
                  Changing this also changes the address they sign in with.
                </p>
              ) : null}
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="um-role">
                Role <span aria-hidden="true" className="req">*</span>
              </label>
              <select
                id="um-role"
                required
                value={fRole}
                disabled={editing?.id === currentAdminId}
                onChange={(e) => setFRole(e.target.value as Role)}
              >
                <option value="buyer">Buyer</option>
                <option value="seller">PWD Seller</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="um-disability">Disability type</label>
              <input
                id="um-disability"
                list="disability-options"
                maxLength={120}
                value={fDisability}
                onChange={(e) => setFDisability(e.target.value)}
              />
              <datalist id="disability-options">
                <option value="Visual impairment"></option>
                <option value="Low vision"></option>
                <option value="Hearing impairment"></option>
                <option value="Speech impairment"></option>
                <option value="Mobility impairment"></option>
                <option value="Physical (upper limb)"></option>
                <option value="Cognitive"></option>
              </datalist>
            </div>
          </div>
          <div className="field">
            <label htmlFor="um-needs">Assistive needs</label>
            <input
              id="um-needs"
              maxLength={200}
              placeholder="e.g. screen reader, high-contrast UI"
              value={fNeeds}
              onChange={(e) => setFNeeds(e.target.value)}
            />
          </div>

          {!editing ? (
            <div className="field" id="um-consent-field">
              <label>
                <input type="checkbox" id="um-consent" checked={fConsent} onChange={(e) => setFConsent(e.target.checked)} />{" "}
                I confirm this person has consented to data processing under RA 10173 (Data Privacy Act).
              </label>
            </div>
          ) : null}

          {err ? (
            <p id="um-error" className="form-error" role="alert">
              {err}
            </p>
          ) : null}

          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={() => modalRef.current?.close()}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" id="um-save" disabled={busy}>
              {editing ? "Save user" : "Send invitation"}
            </button>
          </div>
        </form>
      </dialog>

      <dialog id="user-details" className="modal" ref={detailsRef} aria-labelledby="ud-title">
        <div className="modal-form">
          <h2 id="ud-title">User details</h2>
          <div id="ud-body">
            {detail ? (
              <>
                <dl className="detail-grid">
                  <div>
                    <dt>Name</dt>
                    <dd>{detail.name}</dd>
                  </div>
                  <div>
                    <dt>Email (masked)</dt>
                    <dd>{maskEmail(detail.email)}</dd>
                  </div>
                  <div>
                    <dt>Role</dt>
                    <dd>
                      <span className="badge badge--blue">{detail.role}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <Pill status={detail.account_status} />
                    </dd>
                  </div>
                  <div>
                    <dt>Disability type</dt>
                    <dd>{detail.disability_type || "—"}</dd>
                  </div>
                  <div>
                    <dt>Assistive needs</dt>
                    <dd>{detail.assistive_needs || "—"}</dd>
                  </div>
                  <div>
                    <dt>Joined</dt>
                    <dd>{formatDate(detail.created_at)}</dd>
                  </div>
                  <div>
                    <dt>Last updated</dt>
                    <dd>{formatDate(detail.updated_at)}</dd>
                  </div>
                  <div>
                    <dt>Consent logs</dt>
                    <dd>{detail.footprint.consents}</dd>
                  </div>
                  {detail.role !== "admin" && detail.verified !== null ? (
                    <div>
                      <dt>PWD verification</dt>
                      <dd>
                        {detail.verified ? "Verified" : "Not verified"} ·{" "}
                        <a href={detail.role === "seller" ? "/admin/verifications?view=sellers" : "/admin/verifications"}>
                          Verifications
                        </a>
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <p>
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    disabled={busy || detail.account_status !== "active"}
                    onClick={async () => {
                      setBusy(true);
                      const res = await sendPasswordReset(detail.id);
                      setBusy(false);
                      if (!res.ok) return toast(res.error || "Could not send it.", "error");
                      toast(`Password reset email sent to ${maskEmail(detail.email)}.`, "success");
                    }}
                  >
                    Send password reset email
                  </button>
                </p>
                <h3 className="detail-heading">Activity footprint</h3>
                <ul className="detail-metrics">
                  <li>
                    <strong>{detail.footprint.products}</strong> product{s(detail.footprint.products)} listed
                  </li>
                  <li>
                    <strong>{detail.footprint.orders}</strong> order{s(detail.footprint.orders)} placed
                  </li>
                  <li>
                    <strong>{detail.footprint.reviews}</strong> review{s(detail.footprint.reviews)} written
                  </li>
                  <li>
                    <strong>{detail.footprint.tickets}</strong> support ticket{s(detail.footprint.tickets)}
                  </li>
                </ul>
              </>
            ) : null}
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn--primary"
              data-close-details
              onClick={() => detailsRef.current?.close()}
            >
              Close
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

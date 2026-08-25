"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDate, maskEmail } from "@/lib/format";
import { toast } from "@/lib/toast";
import { createUser, updateUser, deleteUser, updateUserRole, setSellerFeatured } from "@/lib/actions/admin";
import { Icon } from "./Icon";
import type { Profile, Role } from "@/lib/types";
import { TableWrap } from "./TableWrap";
import { DeepLinkFocus } from "./DeepLinkFocus";

type UserRow = Profile & {
  footprint: { products: number; orders: number; reviews: number; tickets: number; consents: number };
};

const ROLES: Role[] = ["buyer", "seller", "admin"];
const s = (n: number) => (n === 1 ? "" : "s");

export function AdminUsersClient({
  users,
  currentAdminId,
}: {
  users: UserRow[];
  currentAdminId: number;
}) {
  const router = useRouter();
  // Dashboard search links here as /admin/users?q=<name>&focus=<id>, so the
  // list arrives already filtered to what the user picked.
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";

  const [role, setRole] = useState("");
  const [q, setQ] = useState(initialQ);

  const modalRef = useRef<HTMLDialogElement>(null);
  const detailsRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [detail, setDetail] = useState<UserRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // form state
  const [fName, setFName] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fRole, setFRole] = useState<Role>("buyer");
  const [fPassword, setFPassword] = useState("");
  const [fDisability, setFDisability] = useState("");
  const [fNeeds, setFNeeds] = useState("");
  const [fConsent, setFConsent] = useState(false);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return users
      .filter((u) => {
        if (role && u.role !== role) return false;
        if (query && (u.name + " " + u.email).toLowerCase().indexOf(query) < 0) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, role, q]);

  function openCreate() {
    setEditing(null);
    setFName("");
    setFEmail("");
    setFRole("buyer");
    setFPassword("");
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
    setFPassword("");
    setFDisability(u.disability_type || "");
    setFNeeds(u.assistive_needs || "");
    setErr(null);
    modalRef.current?.showModal();
  }

  function openDetails(u: UserRow) {
    setDetail(u);
    detailsRef.current?.showModal();
  }

  async function save(e: React.MouseEvent) {
    e.preventDefault();
    setErr(null);
    const input = {
      name: fName,
      email: fEmail,
      role: fRole,
      disability_type: fDisability || null,
      assistive_needs: fNeeds || null,
    };
    if (!editing) {
      if (!fPassword || fPassword.length < 8) {
        setErr("Password must be at least 8 characters.");
        return;
      }
    } else if (fPassword && fPassword.length < 8) {
      setErr("New password must be at least 8 characters (or leave blank).");
      return;
    }
    setBusy(true);
    const res = editing ? await updateUser(editing.id, input) : await createUser(input, fConsent);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error || "Could not save user.");
      toast(res.error || "Could not save user.", "error");
      return;
    }
    toast(editing ? `User "${fName}" updated.` : `User "${fName}" created.`, "success");
    modalRef.current?.close();
    router.refresh();
  }

  async function onDelete(u: UserRow) {
    if (u.id === currentAdminId) {
      toast("You cannot delete the account you are signed in with.", "error");
      return;
    }
    const summary =
      `Delete user "${u.name}" (${u.role})?\n\n` +
      `This will cascade: ${u.footprint.products} product${s(u.footprint.products)}, ` +
      `${u.footprint.orders} order${s(u.footprint.orders)}, ` +
      `${u.footprint.reviews} review${s(u.footprint.reviews)}, and ` +
      `${u.footprint.tickets} ticket${s(u.footprint.tickets)}.\n\nType YES to confirm.`;
    const typed = prompt(summary);
    if (typed !== "YES") {
      toast("Deletion cancelled.", "warning");
      return;
    }
    const res = await deleteUser(u.id);
    if (!res.ok) {
      toast(res.error || "Delete failed.", "error");
      return;
    }
    toast(`User "${u.name}" deleted.`, "success");
    router.refresh();
  }

  async function changeRole(u: UserRow, next: Role) {
    if (u.id === currentAdminId && next !== "admin") {
      toast("You cannot demote your own admin account.", "error");
      return;
    }
    if (!confirm(`Change role of "${u.name}" from "${u.role}" to "${next}"?`)) {
      router.refresh();
      return;
    }
    const res = await updateUserRole(u.id, next);
    if (!res.ok) {
      toast(res.error || "Could not change role.", "error");
      return;
    }
    toast(`Role for "${u.name}" is now ${next}.`, "success");
    router.refresh();
  }

  async function toggleFeaturedSeller(u: UserRow) {
    const next = !u.is_featured_seller;
    let story = u.seller_story || "";
    if (next) {
      const entered = prompt(`Short seller story for "${u.name}" (shown on the homepage):`, story);
      if (entered == null) return; // cancelled
      story = entered;
    }
    const res = await setSellerFeatured(u.id, next, story);
    if (!res.ok) {
      toast(res.error || "Could not update.", "error");
      return;
    }
    toast(next ? `"${u.name}" is now a featured PWD seller.` : `Removed "${u.name}" from featured sellers.`, "success");
    router.refresh();
  }

  return (
    <>
      <div className="page-head">
        <h1>User governance</h1>
        <div className="page-head__actions">
          <button type="button" className="btn btn--primary" id="add-user" onClick={openCreate}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            Add new user
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <label htmlFor="usr-role">Role</label>
        <select id="usr-role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          <option value="buyer">Buyer</option>
          <option value="seller">Seller</option>
          <option value="admin">Admin</option>
        </select>
        <label htmlFor="usr-search" className="sr-only">
          Search
        </label>
        <input
          id="usr-search"
          type="search"
          placeholder="Search by name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="filter-bar__count muted small" aria-live="polite">
          Showing {filtered.length} of {users.length} user{s(users.length)}
        </span>
      </div>

      <DeepLinkFocus />
      <TableWrap label="Users">
        <table className="data-table data-table--cards" aria-label="Registered users">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email (masked)</th>
              <th scope="col">Role</th>
              <th scope="col">Disability type</th>
              <th scope="col">Featured</th>
              <th scope="col">Joined</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody id="user-rows">
            {filtered.map((u) => {
              const isSelf = u.id === currentAdminId;
              return (
                <tr key={u.id} data-row-id={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                    {isSelf ? <span className="badge badge--yellow"> You</span> : null}
                  </td>
                  <td title="Email masked for PII protection (RA 10173)">
                    <code>{maskEmail(u.email)}</code>
                  </td>
                  <td>
                    <select
                      className="role-sel"
                      aria-label={`Change role for ${u.name}`}
                      value={u.role}
                      onChange={(e) => changeRole(u, e.target.value as Role)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{u.disability_type || "—"}</td>
                  <td>
                    {u.role === "seller" ? (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-pressed={u.is_featured_seller}
                        aria-label={
                          u.is_featured_seller
                            ? `Remove ${u.name} from featured PWD sellers`
                            : `Feature ${u.name} as a PWD seller`
                        }
                        onClick={() => toggleFeaturedSeller(u)}
                      >
                        <Icon name="sparkles" size={16} />
                      </button>
                    ) : (
                      <span className="muted small">—</span>
                    )}
                  </td>
                  <td>{formatDate(u.created_at)}</td>
                  <td className="row-actions">
                    <button className="btn btn--ghost btn--sm" onClick={() => openDetails(u)}>
                      Details
                    </button>{" "}
                    <button className="btn btn--ghost btn--sm" onClick={() => openEdit(u)}>
                      Edit
                    </button>{" "}
                    <button
                      className="btn btn--danger btn--sm"
                      disabled={isSelf}
                      aria-disabled={isSelf}
                      title={isSelf ? "You cannot delete yourself" : undefined}
                      onClick={() => onDelete(u)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      {filtered.length === 0 ? <p className="empty">No users match.</p> : null}

      <dialog id="user-modal" className="modal modal--wide" ref={modalRef} aria-labelledby="um-title">
        <form method="dialog" className="modal-form" id="user-form" noValidate>
          <h2 id="um-title">{editing ? `Edit user #${editing.id}` : "Add new user"}</h2>
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
              <input id="um-email" type="email" required value={fEmail} onChange={(e) => setFEmail(e.target.value)} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="um-role">
                Role <span aria-hidden="true" className="req">*</span>
              </label>
              <select id="um-role" required value={fRole} onChange={(e) => setFRole(e.target.value as Role)}>
                <option value="buyer">Buyer</option>
                <option value="seller">PWD Seller</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <div className="field" id="um-password-field">
              <label htmlFor="um-password">
                Password {editing ? null : <span aria-hidden="true" className="req">*</span>}
              </label>
              <input
                id="um-password"
                type="password"
                minLength={8}
                autoComplete="new-password"
                placeholder={editing ? "Leave blank to keep current password" : ""}
                value={fPassword}
                onChange={(e) => setFPassword(e.target.value)}
              />
              <small className="hint">Min 8 chars. Simulated bcrypt cost 12 hashing on save.</small>
            </div>
          </div>
          <div className="row">
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
          </div>

          {!editing ? (
            <div className="field" id="um-consent-field">
              <label>
                <input type="checkbox" id="um-consent" checked={fConsent} onChange={(e) => setFConsent(e.target.checked)} />{" "}
                I confirm this user has consented to data processing under RA 10173 (Data Privacy Act) for IncluMarket.
              </label>
            </div>
          ) : null}

          {err ? (
            <p id="um-error" className="form-error" role="alert">
              {err}
            </p>
          ) : null}

          <div className="form-actions">
            <button
              value="cancel"
              className="btn btn--ghost"
              onClick={(e) => {
                e.preventDefault();
                modalRef.current?.close();
              }}
            >
              Cancel
            </button>
            <button value="submit" className="btn btn--primary" id="um-save" disabled={busy} onClick={save}>
              Save user
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
                </dl>
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

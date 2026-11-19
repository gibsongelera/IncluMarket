import { requireRole } from "@/lib/session";
import { listHref, parseListParams, type ListParams, type RawParams } from "@/lib/list-params";
import {
  USER_ROLES,
  USER_STATUSES,
  getAdminUserList,
  userRole,
  userStatus,
  type UserRoleTab,
  type UserStatusTab,
} from "@/lib/admin-lists";
import { AdminUsersClient, type UsersEmpty } from "@/components/AdminUsersClient";
import { ListToolbar } from "@/components/ListToolbar";
import { Pagination } from "@/components/Pagination";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

const PATH = "/admin/users";

/** What an empty list says, and the way out of it: clear the search, or everyone. */
function emptyState(role: UserRoleTab, status: UserStatusTab, shown: ListParams): UsersEmpty {
  if (shown.q) {
    return { text: `No accounts match “${shown.q}”.`, href: listHref(PATH, shown, { q: null }), action: "Clear search" };
  }
  if (role === "all" && status === "any") return { text: "No accounts yet." };
  const who = USER_ROLES.find((r) => r.value === role)?.label.toLowerCase() ?? "accounts";
  const which = status === "any" ? "" : `${status} `;
  return {
    text: role === "all" ? `No ${which}accounts.` : `No ${which}${who}.`,
    href: PATH,
    action: "See everyone",
  };
}

/** The way to an account ?focus= could not find here. */
function accountHint(filtered: boolean, searched: boolean): string {
  if (filtered && searched) return " Try Everyone with any status, or clear the search.";
  if (filtered) return " Try Everyone with any status.";
  if (searched) return " Try clearing the search.";
  return "";
}

/**
 * Admin → Users (P2-09, 03 §6): every account one page at a time, by name,
 * with tabs per role (?role=, as the Overview's "Active sellers" sends) and
 * per account status (?status=), search by account number, name, email or
 * shop name (the dashboard search sends ?q=<name>&focus=<id>), and the row's
 * governance actions. lib/admin-lists.ts reads the page and the counts.
 */
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const session = await requireRole(["admin"]);
  const params = parseListParams(await searchParams);
  const role = userRole(params.filters.role);
  const status = userStatus(params.filters.status);
  const list = await getAdminUserList(params, role, status);
  // The page actually shown: clamped past the end, or the one holding ?focus=.
  const shown = { ...params, page: list.page };

  return (
    <main id="main" tabIndex={-1} className="main--admin">
      <AdminUsersClient users={list.rows} currentAdminId={session.user_id} empty={emptyState(role, status, shown)}>
        <ListToolbar
          path={PATH}
          params={shown}
          tabs={USER_ROLES.map((r) => ({
            value: r.value === "all" ? null : r.value,
            label: r.label,
            count: list.roleCounts[r.value],
          }))}
          tabParam="role"
          tabsLabel="Show accounts by role"
          moreTabs={{
            param: "status",
            label: "Show accounts by status",
            tabs: USER_STATUSES.map((s) => ({
              value: s.value === "any" ? null : s.value,
              label: s.label,
              count: list.statusCounts[s.value],
            })),
          }}
          search={{ label: "Search users", placeholder: "Name, email, shop or account number" }}
          exportHref="/admin/reports#report-users"
          exportLabel="Users report"
          total={list.total}
          noun={["account", "accounts"]}
        />

        {list.capped || list.focusMissing ? (
          <div className="list-notes">
            {list.capped ? (
              <p>Many accounts match that, so some may be missing. Add more of the name or email to narrow it.</p>
            ) : null}
            {list.focusMissing ? (
              // A link meant one account and it is not here: say so where
              // focus lands (DeepLinkFocus moves it to data-focus-missing).
              <p className="notice notice--warning" tabIndex={-1} data-focus-missing>
                Account #{params.focus} is not in this list.
                {accountHint(role !== "all" || status !== "any", Boolean(params.q))}
              </p>
            ) : null}
          </div>
        ) : null}
      </AdminUsersClient>
      <Pagination path={PATH} params={shown} total={list.total} label="Account pages" />
    </main>
  );
}

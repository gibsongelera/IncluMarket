"use client";

import { logoutAction } from "@/lib/actions/auth";

export function LogoutButton() {
  return (
    <button
      type="button"
      className="btn btn--ghost"
      data-action="logout"
      onClick={() => logoutAction()}
    >
      Sign out
    </button>
  );
}

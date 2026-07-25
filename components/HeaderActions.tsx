"use client";

import { useEffect, useState } from "react";
import { logoutAction } from "@/lib/actions/auth";

export function ContrastToggle() {
  const [high, setHigh] = useState(false);

  useEffect(() => {
    setHigh(document.documentElement.getAttribute("data-contrast") === "high");
  }, []);

  function toggle() {
    const next = !high;
    setHigh(next);
    const root = document.documentElement;
    if (next) root.setAttribute("data-contrast", "high");
    else root.removeAttribute("data-contrast");
    document.cookie = `im_contrast=${next ? "high" : "default"};path=/;max-age=${
      60 * 60 * 24 * 365
    };samesite=lax`;
  }

  return (
    <button
      type="button"
      className="btn btn--ghost"
      data-action="toggle-contrast"
      aria-pressed={high}
      onClick={toggle}
      title="Toggle high-contrast mode"
    >
      Contrast
    </button>
  );
}

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

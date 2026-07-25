"use client";

import { useEffect, useState } from "react";
import { logoutAction } from "@/lib/actions/auth";
import { toast } from "@/lib/toast";

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

export function ResetDemoButton() {
  function reset() {
    if (!confirm("Reset your local cart and appearance preferences?")) return;
    try {
      localStorage.removeItem("inklumarket_cart_v1");
    } catch {
      /* ignore */
    }
    document.cookie = "im_contrast=default;path=/;max-age=0";
    document.documentElement.removeAttribute("data-contrast");
    toast("Local demo preferences reset.", "success");
    setTimeout(() => location.reload(), 400);
  }
  return (
    <button
      type="button"
      className="btn btn--ghost"
      data-action="clear-storage"
      onClick={reset}
      title="Reset local cart and preferences"
    >
      Reset demo
    </button>
  );
}

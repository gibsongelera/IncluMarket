"use client";

import { useEffect, useState } from "react";

export type VisualAlertDetail = {
  tone?: "info" | "success" | "warn" | "error";
  message: string;
};

const EVENT = "im:visual-alert";

export function flashVisualAlert(detail: VisualAlertDetail) {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem("im_visual_alerts") !== "true") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail }));
}

export function VisualAlertHost() {
  const [flash, setFlash] = useState<VisualAlertDetail | null>(null);

  useEffect(() => {
    function onAlert(e: Event) {
      const ce = e as CustomEvent<VisualAlertDetail>;
      setFlash(ce.detail);
      window.setTimeout(() => setFlash(null), 2200);
    }
    window.addEventListener(EVENT, onAlert as EventListener);
    return () => window.removeEventListener(EVENT, onAlert as EventListener);
  }, []);

  if (!flash) return null;
  return (
    <div
      className={`visual-alert visual-alert--${flash.tone || "info"}`}
      role="alert"
      aria-live="assertive"
    >
      {flash.message}
    </div>
  );
}

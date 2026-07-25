"use client";

import { useEffect, useState } from "react";
import type { ToastDetail } from "@/lib/toast";

interface ActiveToast extends ToastDetail {
  id: number;
}

export function Toaster() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  useEffect(() => {
    let counter = 0;
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      const id = ++counter;
      setToasts((prev) => [...prev, { ...detail, id }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3200);
    }
    window.addEventListener("im:toast", onToast);
    return () => window.removeEventListener("im:toast", onToast);
  }, []);

  return (
    <div id="toast-region" className="toast-region" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.variant}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

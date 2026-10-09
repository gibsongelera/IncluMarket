"use client";

// Tiny event-based toast dispatcher so any client component can raise a toast,
// rendered by <Toaster/> into the shared .toast-region (matches ui.toast()).
export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastDetail {
  message: string;
  variant: ToastVariant;
}

/** Coerce action errors so a serialized `{}` AuthError never reaches the toast. */
export function errorText(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const t = value.trim();
    if (t && t !== "{}" && t !== "[object Object]") return t;
  }
  return fallback;
}

export function toast(message: string, variant: ToastVariant = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ToastDetail>("im:toast", {
      detail: { message: errorText(message, "Something went wrong."), variant },
    })
  );
}

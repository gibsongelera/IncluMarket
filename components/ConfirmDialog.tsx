"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Confirmation dialog for consequential actions — the accessible replacement
 * for window.confirm() and window.prompt(), which the admin and seller screens
 * used for deletes, role changes and returns (N-17). Native <dialog>, so focus
 * is trapped and Esc closes it for free.
 *
 * - Initial focus goes to Cancel for a "danger" action (the safe choice) and
 *   to the reason field when one is asked for.
 * - An optional reason is a real <textarea> with a visible label, a length
 *   hint and inline validation, instead of a one-line browser prompt.
 * - Errors from the server render inside the dialog, next to the button.
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  reason?: {
    label: string;
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    hint?: string;
    defaultValue?: string;
  };
  error?: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "primary",
  busy = false,
  reason,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [text, setText] = useState(reason?.defaultValue ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      setText(reason?.defaultValue ?? "");
      setLocalError(null);
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
    // reason?.defaultValue intentionally read only when opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const value = text.trim();
    if (reason?.required && value.length < (reason.minLength ?? 1)) {
      setLocalError(
        reason.minLength && reason.minLength > 1
          ? `Please write at least ${reason.minLength} characters.`
          : "This field is required."
      );
      return;
    }
    onConfirm(value);
  }

  const shownError = localError || error;

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form className="modal-form" onSubmit={submit} noValidate>
        <h2 id={`${id}-title`}>{title}</h2>
        {children ? <div className="confirm-dialog__body">{children}</div> : null}
        {reason ? (
          <div className="field">
            <label htmlFor={`${id}-reason`}>
              {reason.label}
              {reason.required ? <span aria-hidden="true" className="req"> *</span> : null}
            </label>
            <textarea
              id={`${id}-reason`}
              rows={3}
              autoFocus
              maxLength={reason.maxLength ?? 500}
              required={reason.required}
              aria-describedby={reason.hint ? `${id}-hint` : undefined}
              aria-invalid={localError ? true : undefined}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {reason.hint ? (
              <p id={`${id}-hint`} className="hint">
                {reason.hint}
              </p>
            ) : null}
          </div>
        ) : null}
        {shownError ? (
          <p className="form-error" role="alert">
            {shownError}
          </p>
        ) : null}
        <div className="form-actions">
          <button
            type="button"
            className="btn btn--ghost"
            autoFocus={!reason && tone === "danger"}
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button type="submit" className={`btn ${tone === "danger" ? "btn--danger" : "btn--primary"}`} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

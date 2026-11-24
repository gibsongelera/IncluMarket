"use client";

import { useState } from "react";
import { startAssist } from "@/lib/actions/assist";
import { ASSIST_REASON_MAX, ASSIST_REASON_MIN } from "@/lib/assist/rules";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Asks an admin why they are opening a seller's Seller Centre, says what that
 * means, then opens it (lib/actions/assist.ts). Admin → Users (a seller's row
 * and Details) and the seller set-up page use it.
 */
export function AssistSellerDialog({
  seller,
  onClose,
}: {
  /** The seller to open, or null when the dialog is closed. */
  seller: { id: number; name: string } | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(reason: string) {
    if (!seller || busy) return;
    setBusy(true);
    setError(null);
    const res = await startAssist(seller.id, reason);
    if (!res.ok) {
      setBusy(false);
      setError(res.error || "Could not open their shop. Please try again.");
      return;
    }
    // A full load: from here every page and the header are the seller's.
    window.location.assign("/seller/dashboard");
  }

  function cancel() {
    if (busy) return;
    setError(null);
    onClose();
  }

  return (
    <ConfirmDialog
      open={seller !== null}
      title={seller ? `Open ${seller.name}'s Seller Centre?` : ""}
      confirmLabel="Open Seller Centre"
      busy={busy}
      error={error}
      reason={{
        label: "Why are you opening this shop? (kept in the audit log)",
        required: true,
        minLength: ASSIST_REASON_MIN,
        maxLength: ASSIST_REASON_MAX,
        hint: "For example: “Asked for help adding new products, at the AVRC office.”",
      }}
      onConfirm={confirm}
      onCancel={cancel}
    >
      <p>
        You work in their shop as they would: add and edit products, answer buyers and update orders.
        Listings still go to review, and every sale stays theirs.
      </p>
      <p>
        Everything you do is logged under your name, and {seller?.name ?? "the seller"} is told you opened
        their shop. Their account settings, password, PWD ID, support requests and payouts stay closed. It
        ends when you choose Stop assisting, when you sign out, or after two hours.
      </p>
    </ConfirmDialog>
  );
}

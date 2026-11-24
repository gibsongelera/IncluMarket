"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { toJpeg } from "@/lib/image-client";
import { submitPaymentProof } from "@/lib/actions/counter-payments";
import { cleanAmount, cleanReference } from "@/lib/counter-channels";

/**
 * What the buyer sends once they have paid the Workshop (migration 0028):
 * how they paid, the reference number on the receipt, the amount, and a
 * photo of the receipt if they have one. The photo is resized here to a JPEG
 * under 1 MB; the server checks its bytes again.
 */
export function CounterPayForm({
  checkoutId,
  channels,
  amountDue,
  submitLabel = "Send payment details",
}: {
  checkoutId: number;
  channels: { id: string; label: string }[];
  amountDue: number;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState(channels.length === 1 ? channels[0].id : "");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState(amountDue.toFixed(2));
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: "channel" | "reference" | "amount" | "form"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addPhotoRef = useRef<HTMLButtonElement>(null);

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setPreparing(true);
    try {
      const blob = await toJpeg(file, 1600, 1_000_000);
      setPhoto({ blob, preview: URL.createObjectURL(blob) });
    } catch {
      toast("That photo could not be used. Try a JPEG or PNG photo.", "error");
    } finally {
      setPreparing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removePhoto() {
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhoto(null);
    requestAnimationFrame(() => addPhotoRef.current?.focus());
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!channel) {
      setError({ field: "channel", text: "Choose how you paid." });
      document.querySelector<HTMLInputElement>('input[name="pay-channel"]')?.focus();
      return;
    }
    if (!cleanReference(reference)) {
      setError({ field: "reference", text: "Enter the reference number from your receipt: 4 to 40 letters, numbers or dashes." });
      document.getElementById("pay-reference")?.focus();
      return;
    }
    if (cleanAmount(amount) === null) {
      setError({ field: "amount", text: "Enter the amount you sent, for example 350 or 1,250.50." });
      document.getElementById("pay-amount")?.focus();
      return;
    }
    const form = new FormData();
    form.set("checkoutId", String(checkoutId));
    form.set("channel", channel);
    form.set("reference", reference);
    form.set("amount", amount);
    if (photo) form.set("receipt", new File([photo.blob], "receipt.jpg", { type: "image/jpeg" }));
    setBusy(true);
    const res = await submitPaymentProof(form);
    setBusy(false);
    if (!res.ok) {
      setError({ field: "form", text: res.error || "We could not send it. Please try again." });
      return;
    }
    toast("Sent. The Workshop will check your payment and tell you.", "success");
    router.refresh();
  }

  const fieldError = (field: "channel" | "reference" | "amount") =>
    error?.field === field ? (
      <p id={`pay-${field}-err`} className="field-error">
        {error.text}
      </p>
    ) : null;

  return (
    <form className="pay-form" noValidate onSubmit={onSubmit}>
      <fieldset className="radio-group" aria-describedby={error?.field === "channel" ? "pay-channel-err" : undefined}>
        <legend>How did you pay?</legend>
        {channels.map((c) => (
          <label key={c.id} className="radio">
            <input
              type="radio"
              name="pay-channel"
              value={c.id}
              checked={channel === c.id}
              onChange={() => setChannel(c.id)}
            />
            {c.label}
          </label>
        ))}
        {fieldError("channel")}
      </fieldset>

      <div className="field">
        <label htmlFor="pay-reference">Reference number</label>
        <input
          id="pay-reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          aria-invalid={error?.field === "reference" ? true : undefined}
          aria-describedby={["pay-reference-hint", error?.field === "reference" ? "pay-reference-err" : ""].filter(Boolean).join(" ")}
        />
        <p id="pay-reference-hint" className="hint">
          It is on your receipt or in your app&rsquo;s transaction history, often labelled Ref. No.
        </p>
        {fieldError("reference")}
      </div>

      <div className="field">
        <label htmlFor="pay-amount">Amount you sent (₱)</label>
        <input
          id="pay-amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={error?.field === "amount" ? true : undefined}
          aria-describedby={error?.field === "amount" ? "pay-amount-err" : undefined}
        />
        {fieldError("amount")}
      </div>

      <fieldset className="pay-form__photo-set">
        <legend>
          Photo of the receipt <span className="muted">(optional)</span>
        </legend>
        {photo ? (
          <div className="pay-form__photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.preview} alt="Your receipt, ready to send" />
            <button type="button" className="btn btn--ghost btn--sm" onClick={removePhoto}>
              Remove photo
            </button>
          </div>
        ) : (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png"
              hidden
              onChange={(e) => void choosePhoto(e.target.files?.[0])}
            />
            <button
              ref={addPhotoRef}
              type="button"
              className="btn btn--outline btn--sm"
              aria-describedby="pay-photo-hint"
              disabled={preparing}
              onClick={() => fileRef.current?.click()}
            >
              {preparing ? "Preparing the photo…" : "Add a photo of the receipt"}
            </button>
            <p id="pay-photo-hint" className="hint">
              A screenshot of the app&rsquo;s confirmation works too. Only the Workshop&rsquo;s admins see it.
            </p>
          </>
        )}
      </fieldset>

      {error?.field === "form" ? (
        <p className="form-error" role="alert">
          {error.text}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={busy || preparing}>
          {busy ? "Sending…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

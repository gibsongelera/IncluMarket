"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { submitPwdVerification, type VerificationField } from "@/lib/actions/verification";
import { toast } from "@/lib/toast";
import { PWD_ID_EXAMPLE, checkExpiry, cleanLgu, manilaToday, normalizePwdIdNumber } from "@/lib/pwd/id-number";
import { IdPhotoCapture, type CapturedPhoto, type PhotoKind } from "./IdPhotoCapture";

type Step = "consent" | "details" | "photos" | "review";

const STEPS: { id: Step; label: string }[] = [
  { id: "consent", label: "Your consent" },
  { id: "details", label: "ID details" },
  { id: "photos", label: "Photos" },
  { id: "review", label: "Check and send" },
];

const PHOTOS: { kind: PhotoKind; title: string; noun: string; hint: string }[] = [
  {
    kind: "front",
    title: "Front of your PWD ID",
    noun: "photo of the front of your PWD ID",
    hint: "Lay the ID flat in good light. Fit it inside the frame so every word is readable.",
  },
  { kind: "back", title: "Back of your PWD ID", noun: "photo of the back of your PWD ID", hint: "Turn the ID over and take the same kind of photo." },
  {
    kind: "selfie",
    title: "You holding your ID",
    noun: "photo of you holding your ID",
    hint: "Hold the ID next to your face, photo side toward the camera. We compare it with the ID photo by eye.",
  },
];

const STEP_FOR_FIELD: Record<VerificationField, Step> = {
  consent: "consent",
  idNumber: "details",
  issuingLgu: "details",
  expiresOn: "details",
  front: "photos",
  back: "photos",
  selfie: "photos",
};

/**
 * Account → PWD verification: consent → ID details → photos → check and send.
 * Nothing leaves the browser until the last step, and every step can be
 * revisited without losing what was typed or taken.
 */
export function PwdVerificationFlow({
  role,
  retentionDays,
  reviewDays,
  renewal,
}: {
  role: "buyer" | "seller";
  retentionDays: number;
  reviewDays: number;
  renewal: boolean;
}) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const [step, setStep] = useState<Step>("consent");
  const [consent, setConsent] = useState(false);
  const [idNumber, setIdNumber] = useState("");
  const [lgu, setLgu] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [photos, setPhotos] = useState<Record<PhotoKind, CapturedPhoto | null>>({ front: null, back: null, selfie: null });
  const [errors, setErrors] = useState<Partial<Record<VerificationField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Move focus to the new step's heading so keyboard and screen-reader users
  // land at the top of what changed.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  // Release preview URLs when they are replaced or the flow goes away.
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  function setPhoto(kind: PhotoKind, photo: CapturedPhoto | null) {
    setPhotos((prev) => {
      if (prev[kind]) URL.revokeObjectURL(prev[kind]!.url);
      return { ...prev, [kind]: photo };
    });
    if (photo) urls.current.push(photo.url);
    setErrors((e) => ({ ...e, [kind]: undefined }));
  }

  function checkDetails(): boolean {
    const next: Partial<Record<VerificationField, string>> = {};
    const normalized = normalizePwdIdNumber(idNumber);
    if (!normalized) next.idNumber = `Enter the 16-digit number as printed, for example ${PWD_ID_EXAMPLE}.`;
    const l = cleanLgu(lgu);
    if (!l.ok) next.issuingLgu = l.error;
    const e = checkExpiry(expiresOn);
    if (!e.ok) next.expiresOn = e.error;
    setErrors(next);
    if (normalized) setIdNumber(normalized);
    return Object.keys(next).length === 0;
  }

  function checkPhotos(): boolean {
    const next: Partial<Record<VerificationField, string>> = {};
    for (const p of PHOTOS) if (!photos[p.kind]) next[p.kind] = `Add the ${p.noun}.`;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function send() {
    setFormError(null);
    setSending(true);
    try {
      const fd = new FormData();
      fd.set("consent", consent ? "yes" : "no");
      fd.set("idNumber", idNumber);
      fd.set("issuingLgu", lgu);
      fd.set("expiresOn", expiresOn);
      for (const p of PHOTOS) {
        const photo = photos[p.kind];
        if (photo) fd.set(p.kind, new File([photo.blob], `${p.kind}.jpg`, { type: "image/jpeg" }));
      }
      const res = await submitPwdVerification(fd);
      if (res.ok) {
        toast("Thank you. We received your PWD ID.", "success");
        router.refresh();
        return;
      }
      const msg = res.error || "We could not send your ID. Please try again.";
      if (res.field && res.field !== "consent") {
        setErrors({ [res.field]: msg });
        setStep(STEP_FOR_FIELD[res.field]);
      } else {
        setFormError(msg);
      }
    } catch {
      setFormError("We could not reach the server. Check your connection and try again — your details are still here.");
    } finally {
      setSending(false);
    }
  }

  const index = STEPS.findIndex((s) => s.id === step);
  const today = manilaToday();

  return (
    <section className="card verify-flow" aria-labelledby="verify-step-title">
      <ol className="steps" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            className={`steps__item${i === index ? " steps__item--current" : ""}${i < index ? " steps__item--done" : ""}`}
            aria-current={i === index ? "step" : undefined}
          >
            <span className="steps__num" aria-hidden="true">
              {i < index ? "✓" : i + 1}
            </span>
            <span className="steps__label">
              {s.label}
              {i < index ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        ))}
      </ol>

      <h2 id="verify-step-title" ref={headingRef} tabIndex={-1} className="verify-flow__title">
        Step {index + 1} of {STEPS.length}: {STEPS[index].label}
      </h2>

      {step === "consent" ? (
        <div className="verify-flow__body">
          <p>
            {renewal ? "To renew your verification" : "To confirm that you are a person with a disability"}, we need
            photos of your PWD ID and a photo of you holding it. Under the Data Privacy Act (RA 10173) these are
            sensitive personal information, so we ask first.
          </p>
          <dl className="details-list details-list--stacked">
            <dt>What we collect</dt>
            <dd>
              Your PWD ID number, the office that issued it, its expiry date, photos of the front and back of the ID,
              and a photo of you holding it.
            </dd>
            <dt>Why</dt>
            <dd>
              {role === "seller"
                ? "So your listings can appear in the shop with a Verified PWD seller badge."
                : "So you can get PWD discounts on items where one applies."}
            </dd>
            <dt>Who sees it</dt>
            <dd>
              Only InclusiveMarket administrators at AVRC Region IX. Buyers and sellers never see your ID; they see
              only a &ldquo;Verified PWD&rdquo; badge.
            </dd>
            <dt>How long we keep it</dt>
            <dd>
              We delete the photos {retentionDays} days after we decide. We keep the result, the last four digits of
              your ID number, its expiry date and who reviewed it, so we can show your badge.
            </dd>
            <dt>Your rights</dt>
            <dd>
              You can ask us to correct or delete your data through the <Link href="/contact">Contact page</Link>.
              Read our <Link href="/privacy">Privacy Policy</Link>.
            </dd>
          </dl>
          <div className="field field--check">
            <input
              id="verify-consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setErrors((x) => ({ ...x, consent: undefined }));
              }}
              aria-describedby={errors.consent ? "verify-consent-err" : undefined}
            />
            <label htmlFor="verify-consent">
              I agree to InclusiveMarket using my PWD ID details and photos for verification, as described above.
            </label>
          </div>
          {errors.consent ? (
            <p className="field-error" id="verify-consent-err" role="alert">
              {errors.consent}
            </p>
          ) : null}
          <div className="verify-flow__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                if (!consent) {
                  setErrors({ consent: "Tick the box to agree before you continue." });
                  return;
                }
                setStep("details");
              }}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {step === "details" ? (
        <form
          className="verify-flow__body"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (checkDetails()) setStep("photos");
          }}
        >
          <div className="field">
            <label htmlFor="verify-number">PWD ID number</label>
            <input
              id="verify-number"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              onBlur={() => {
                const n = normalizePwdIdNumber(idNumber);
                if (n) setIdNumber(n);
              }}
              aria-invalid={errors.idNumber ? true : undefined}
              aria-describedby={`verify-number-hint${errors.idNumber ? " verify-number-err" : ""}`}
            />
            <p className="hint" id="verify-number-hint">
              16 digits, as printed on the card. Dashes are optional. Example: {PWD_ID_EXAMPLE}
            </p>
            {errors.idNumber ? (
              <p className="field-error" id="verify-number-err">
                {errors.idNumber}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="verify-lgu">Issuing office</label>
            <input
              id="verify-lgu"
              autoComplete="off"
              value={lgu}
              onChange={(e) => setLgu(e.target.value)}
              aria-invalid={errors.issuingLgu ? true : undefined}
              aria-describedby={`verify-lgu-hint${errors.issuingLgu ? " verify-lgu-err" : ""}`}
            />
            <p className="hint" id="verify-lgu-hint">
              The city or municipality (PDAO) that issued your ID, for example Zamboanga City PDAO.
            </p>
            {errors.issuingLgu ? (
              <p className="field-error" id="verify-lgu-err">
                {errors.issuingLgu}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="verify-expiry">Expiry date</label>
            <input
              id="verify-expiry"
              type="date"
              min={today}
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
              aria-invalid={errors.expiresOn ? true : undefined}
              aria-describedby={`verify-expiry-hint${errors.expiresOn ? " verify-expiry-err" : ""}`}
            />
            <p className="hint" id="verify-expiry-hint">
              As printed on the card. We cannot accept an expired ID.
            </p>
            {errors.expiresOn ? (
              <p className="field-error" id="verify-expiry-err">
                {errors.expiresOn}
              </p>
            ) : null}
          </div>

          {Object.values(errors).some(Boolean) ? (
            <p className="form-error" role="alert">
              Please fix the highlighted {Object.values(errors).filter(Boolean).length === 1 ? "field" : "fields"}.
            </p>
          ) : null}

          <div className="verify-flow__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setStep("consent")}>
              Back
            </button>
            <button type="submit" className="btn btn--primary">
              Continue
            </button>
          </div>
        </form>
      ) : null}

      {step === "photos" ? (
        <div className="verify-flow__body">
          <p>
            Use your camera, or upload photos you already have. We remove location and other hidden data from every
            photo before it leaves your device.
          </p>
          <div className="capture-list">
            {PHOTOS.map((p) => (
              <IdPhotoCapture
                key={p.kind}
                kind={p.kind}
                title={p.title}
                hint={p.hint}
                value={photos[p.kind]}
                onChange={(photo) => setPhoto(p.kind, photo)}
                error={errors[p.kind]}
              />
            ))}
          </div>
          <div className="verify-flow__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setStep("details")}>
              Back
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                if (checkPhotos()) setStep("review");
              }}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="verify-flow__body">
          <dl className="details-list">
            <dt>PWD ID number</dt>
            <dd className="mono">{idNumber}</dd>
            <dt>Issuing office</dt>
            <dd>{lgu}</dd>
            <dt>Expiry date</dt>
            <dd>{expiresOn}</dd>
          </dl>
          <p>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setStep("details")}>
              Change details
            </button>
          </p>
          <ul className="review-photos" aria-label="Your photos">
            {PHOTOS.map((p) => (
              <li key={p.kind}>
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                {photos[p.kind] ? <img src={photos[p.kind]!.url} alt={p.title} /> : null}
                <span>{p.title}</span>
              </li>
            ))}
          </ul>
          <p>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setStep("photos")}>
              Change photos
            </button>
          </p>
          <p className="hint">
            We review IDs within about {reviewDays} business days and tell you here and by email.
          </p>
          {formError ? (
            <p className="form-error" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="verify-flow__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setStep("photos")} disabled={sending}>
              Back
            </button>
            <button type="button" className="btn btn--primary" onClick={send} disabled={sending} aria-busy={sending}>
              {sending ? "Sending…" : "Send for review"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

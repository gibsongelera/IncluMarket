"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createSellerAccount, resendAccountSetupEmail } from "@/lib/actions/admin-sellers";
import {
  SELLER_SETUP_MAX,
  checkSellerSetup,
  firstErrorField,
  type SellerSetupErrors,
  type SellerSetupField,
  type SellerSetupInput,
} from "@/lib/seller-setup";
import { SELLER_RULES } from "@/lib/seller-setup-rules";
import { PWD_ID_EXAMPLE } from "@/lib/pwd/id-number";
import { maskEmail } from "@/lib/format";
import { toast } from "@/lib/toast";
import { EmailText } from "./EmailText";

const EMPTY: SellerSetupInput = {
  name: "",
  email: "",
  phone: "",
  disability: "",
  needs: "",
  idNumber: "",
  lgu: "",
  expiresOn: "",
  seenNote: "",
  shopName: "",
  city: "",
  story: "",
  consent: false,
};

/** The kinds of disability a Philippine PWD ID names. Free text is still accepted. */
const DISABILITIES = [
  "Deaf or hard of hearing",
  "Intellectual disability",
  "Learning disability",
  "Mental disability",
  "Physical disability (orthopedic)",
  "Psychosocial disability",
  "Speech and language impairment",
  "Visual disability",
  "Cancer (RA 11215)",
  "Rare disease (RA 10747)",
];

type TextField = Exclude<SellerSetupField, "consent">;

interface Done {
  userId: number;
  name: string;
  email: string;
  shopName: string;
  idLast4: string;
  emailSent: boolean;
}

/**
 * The set-up form (app/admin/users/new-seller). One check runs here and in
 * the server action (lib/seller-setup.ts), so the words under each field are
 * the same either way. After a save the form gives way to what happened:
 * the account, the verified ID, and whether the email went.
 */
export function SellerSetupForm({ canSubmit }: { canSubmit: boolean }) {
  const [f, setF] = useState<SellerSetupInput>(EMPTY);
  const [errors, setErrors] = useState<SellerSetupErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [sending, setSending] = useState(false);
  // Focus moves once the new state has rendered, so a screen reader reads a
  // field together with the error now under it.
  const [focusId, setFocusId] = useState<string | null>(null);
  const doneRef = useRef<HTMLElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!focusId) return;
    if (focusId === "ss-done") doneRef.current?.focus();
    else if (focusId === "ss-form-error") formErrorRef.current?.focus();
    else document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  function set<K extends keyof SellerSetupInput>(key: K, value: SellerSetupInput[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function showErrors(found: SellerSetupErrors, message: string) {
    setErrors(found);
    setFormError(message);
    const first = firstErrorField(found);
    setFocusId(first ? `ss-${first}` : "ss-form-error");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !canSubmit) return;
    setFormError(null);
    const checked = checkSellerSetup(f, SELLER_RULES);
    if (!checked.ok) {
      const n = Object.keys(checked.errors).length;
      showErrors(checked.errors, n === 1 ? "Check the field marked below." : `Check the ${n} fields marked below.`);
      return;
    }
    setErrors({});
    setBusy(true);
    const res = await createSellerAccount(f);
    setBusy(false);
    if (!res.ok || !res.userId) {
      showErrors(res.errors ?? {}, res.error || "Could not set up the seller. Please try again.");
      return;
    }
    const v = checked.value;
    setDone({ userId: res.userId, name: v.name, email: v.email, shopName: v.shopName, idLast4: v.idLast4, emailSent: res.emailSent === true });
    toast(`${v.name}'s seller account is ready.`, "success");
    setFocusId("ss-done");
  }

  async function sendAgain() {
    if (!done || sending) return;
    setSending(true);
    const res = await resendAccountSetupEmail(done.userId);
    setSending(false);
    if (!res.ok) {
      toast(res.error || "Could not send the email.", "error");
      return;
    }
    setDone({ ...done, emailSent: true });
    toast(`Sent again to ${maskEmail(done.email)}.`, "success");
  }

  function setUpAnother() {
    setF(EMPTY);
    setErrors({});
    setFormError(null);
    setDone(null);
    setFocusId("ss-name");
  }

  if (done) {
    return (
      <section className="card setup-done" aria-labelledby="ss-done-title" tabIndex={-1} ref={doneRef} id="ss-done">
        <h2 id="ss-done-title">{done.name}&rsquo;s seller account is ready</h2>
        <ul className="setup-done__facts">
          <li>
            Shop: <strong>{done.shopName}</strong>
          </li>
          <li>PWD ID ending {done.idLast4}: verified in person</li>
        </ul>
        {done.emailSent ? (
          <p className="notice notice--success">
            We emailed <EmailText address={maskEmail(done.email)} /> a link to choose their password. It works once,
            within one hour. If it runs out, send it again here, or they can choose Forgot password on the sign-in page.
          </p>
        ) : (
          <p className="notice notice--warning" role="alert">
            The account is ready, but the email to <EmailText address={maskEmail(done.email)} /> could not be sent.
            Send it again. If it keeps failing, check the email settings.
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn--outline" onClick={sendAgain} disabled={sending}>
            {sending ? "Sending…" : "Send the email again"}
          </button>
          <Link className="btn btn--outline" href={`/admin/users?q=${done.userId}&focus=${done.userId}`}>
            Open their account
          </Link>
          <button type="button" className="btn btn--primary" onClick={setUpAnother}>
            Set up another seller
          </button>
        </div>
      </section>
    );
  }

  const field = (
    name: TextField,
    label: string,
    opts: {
      hint?: string;
      type?: "text" | "email" | "tel" | "date";
      inputMode?: "text" | "tel" | "numeric" | "email";
      optional?: boolean;
      textarea?: boolean;
      list?: string;
      max?: number;
    } = {}
  ) => {
    const id = `ss-${name}`;
    const error = errors[name];
    const describedBy = [opts.hint ? `${id}-hint` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined;
    const shared = {
      id,
      name,
      value: f[name],
      required: !opts.optional,
      maxLength: opts.max,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": describedBy,
    };
    return (
      <div className="field">
        <label htmlFor={id}>
          {label}
          {opts.optional ? (
            <span className="muted"> (optional)</span>
          ) : (
            <span aria-hidden="true" className="req">
              {" "}
              *
            </span>
          )}
        </label>
        {opts.textarea ? (
          <textarea {...shared} rows={4} onChange={(e) => set(name, e.target.value)} />
        ) : (
          <input
            {...shared}
            type={opts.type ?? "text"}
            inputMode={opts.inputMode}
            list={opts.list}
            autoComplete="off"
            onChange={(e) => set(name, e.target.value)}
          />
        )}
        {opts.hint ? (
          <p id={`${id}-hint`} className="hint">
            {opts.hint}
          </p>
        ) : null}
        {error ? (
          <p id={`${id}-err`} className="field-error">
            {error}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <form className="seller-setup" noValidate onSubmit={onSubmit}>
      {formError ? (
        <p className="form-error" role="alert" tabIndex={-1} ref={formErrorRef}>
          {formError}
        </p>
      ) : null}
      <p className="hint">
        Fields marked <span aria-hidden="true">*</span>
        <span className="sr-only">with a star</span> are needed.
      </p>

      <fieldset>
        <legend>About the seller</legend>
        <div className="row">
          {field("name", "Full name", { max: SELLER_SETUP_MAX.name, hint: "As it is on their PWD ID." })}
          {field("email", "Email address", {
            type: "email",
            inputMode: "email",
            max: SELLER_SETUP_MAX.email,
            hint: "The link to choose a password goes here. It can be the address of someone who helps them.",
          })}
        </div>
        <div className="row">
          {field("phone", "Mobile number", {
            type: "tel",
            inputMode: "tel",
            max: 16,
            hint: "So AVRC staff and the Workshop can reach them, for example 0917 123 4567.",
          })}
          {field("disability", "Disability", {
            list: "ss-disabilities",
            max: SELLER_SETUP_MAX.disability,
            hint: "As written on the PWD ID.",
          })}
        </div>
        {field("needs", "What helps them use the site", {
          optional: true,
          max: SELLER_SETUP_MAX.needs,
          hint: "For example: a screen reader, large text, or someone who reads for them.",
        })}
        <datalist id="ss-disabilities">
          {DISABILITIES.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </fieldset>

      <fieldset>
        <legend>Their PWD ID card</legend>
        <p className="hint">
          Copy these from the card itself. We keep only the last four digits of the number, and a code made from it
          that stops the same ID being used on two accounts.
        </p>
        <div className="row">
          {field("idNumber", "PWD ID number", { inputMode: "numeric", max: 24, hint: `16 digits, for example ${PWD_ID_EXAMPLE}.` })}
          {field("expiresOn", "Valid until", { type: "date", hint: "The expiry date printed on the card." })}
        </div>
        <div className="row">
          {field("lgu", "Issued by", {
            max: SELLER_SETUP_MAX.lgu,
            hint: "The city or municipal PDAO, for example Zamboanga City PDAO.",
          })}
          {field("seenNote", "Where and when you saw the card", {
            max: SELLER_SETUP_MAX.seenNote,
            hint: "For example: Seen at AVRC on 24 Nov.",
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend>Their shop</legend>
        <div className="row">
          {field("shopName", "Shop name", { max: SELLER_SETUP_MAX.shopName, hint: "Buyers see it on every product. 2 to 80 characters." })}
          {field("city", "Town or city", { optional: true, max: SELLER_SETUP_MAX.city, hint: "Where their orders are sent from." })}
        </div>
        {field("story", "About the seller", {
          optional: true,
          textarea: true,
          max: SELLER_SETUP_MAX.story,
          hint: "A few sentences for their shop page, in their own words. They can change it later.",
        })}
      </fieldset>

      <fieldset>
        <legend>Consent</legend>
        <div className="field field--check">
          <input
            id="ss-consent"
            name="consent"
            type="checkbox"
            checked={f.consent}
            onChange={(e) => set("consent", e.target.checked)}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? "ss-consent-err" : undefined}
          />
          <label htmlFor="ss-consent">
            The seller agreed, in person, to InclusiveMarket keeping these details and a code made from their PWD ID
            number, under RA 10173 (Data Privacy Act).
          </label>
        </div>
        {errors.consent ? (
          <p id="ss-consent-err" className="field-error">
            {errors.consent}
          </p>
        ) : null}
      </fieldset>

      <div className="form-actions">
        <Link className="btn btn--ghost" href="/admin/users">
          Cancel
        </Link>
        <button type="submit" className="btn btn--primary" disabled={busy || !canSubmit}>
          {busy ? "Setting up…" : "Set up the seller and email them"}
        </button>
      </div>
    </form>
  );
}

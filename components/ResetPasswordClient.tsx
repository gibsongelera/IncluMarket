"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updatePasswordAction } from "@/lib/actions/auth";
import { toast } from "@/lib/toast";

/**
 * Set a new password after following the emailed recovery link.
 *
 * No token is handled here. /auth/callback has already exchanged the recovery
 * code for a session, so the server action proves ownership from that session
 * — there is nothing in this component an attacker could tamper with.
 *
 * `welcome` words it for someone choosing their first password, from the
 * set-up email an administrator sent (an account AVRC staff made for them).
 * Only the words change: the same marker and the same action.
 */
export function ResetPasswordClient({
  hasSession,
  email,
  welcome = false,
}: {
  hasSession: boolean;
  email: string | null;
  welcome?: boolean;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Move focus to the message so a screen reader announces it, rather than
  // leaving the user to discover that submitting did something.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  // "/login", not "/": the root redirects to /home and would drop ?reset=1.
  if (!hasSession) {
    return welcome ? (
      <>
        <p className="lede">This link is no longer valid.</p>
        <p>
          The link in a set-up email works once, within one hour of being sent. You can still choose
          your password: we will email you a code instead.
        </p>
        <p>
          <Link className="btn btn--primary" href="/login?reset=1">
            Get a code by email
          </Link>
        </p>
      </>
    ) : (
      <>
        <p className="lede">This reset link is no longer valid.</p>
        <p>
          Reset links expire one hour after they are sent, and can only be used once.
        </p>
        <p>
          <Link className="btn btn--primary" href="/login?reset=1">
            Request a new link
          </Link>
        </p>
      </>
    );
  }

  if (done) {
    return (
      <>
        <p className="lede">{welcome ? "Your password is saved." : "Your password has been changed."}</p>
        <p>You are signed in already — there is no need to enter it again right now.</p>
        <p>
          <Link className="btn btn--primary" href={welcome ? "/" : "/home"}>
            Continue to InclusiveMarket
          </Link>
        </p>
      </>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setBusy(true);
    const res = await updatePasswordAction(password);
    setBusy(false);

    if (!res.ok) {
      setError(res.error || "Could not change your password.");
      return;
    }

    setDone(true);
    toast(welcome ? "Password saved." : "Password changed.", "success");
    // A new seller's home is the Seller Centre: "/" sends each role to its own.
    setTimeout(() => router.push(welcome ? "/" : "/home"), 1200);
  }

  return (
    <>
      <p className="lede">
        {welcome
          ? `Welcome to InclusiveMarket. Choose the password you will sign in with${email ? `, as ${email}` : ""}.`
          : email
            ? `Choose a new password for ${email}.`
            : "Choose a new password."}
      </p>

      <form className="form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="new-password">{welcome ? "Password" : "New password"}</label>
          <input
            id="new-password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-describedby="password-help"
          />
          <p id="password-help" className="hint">
            At least 8 characters, including a letter and a number.
          </p>
        </div>

        <div className="field">
          <label htmlFor="confirm-password">{welcome ? "Repeat the password" : "Repeat new password"}</label>
          <input
            id="confirm-password"
            name="confirm"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
            />{" "}
            Show password
          </label>
        </div>

        {error ? (
          <p
            className="form-error"
            role="alert"
            tabIndex={-1}
            ref={errorRef}
          >
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Saving…" : welcome ? "Save my password" : "Save new password"}
          </button>
        </div>
      </form>
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  loginAction,
  requestPasswordResetAction,
  verifyPasswordResetCodeAction,
  verifySignupCodeAction,
  resendConfirmationAction,
  signupAction,
} from "@/lib/actions/auth";
import { errorText, toast } from "@/lib/toast";
import type { Role } from "@/lib/types";
import { BrandMark } from "./BrandMark";

const HOME_BY_ROLE: Record<Role, string> = {
  buyer: "/home",
  seller: "/seller/dashboard",
  admin: "/admin",
};

export function LandingClient({
  stats,
  initialTab = "signin",
}: {
  stats: { products: number; sellers: number; orders: number };
  /** "signup" when the visitor came for Create account (?tab=signup). */
  initialTab?: "signin" | "signup";
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"signin" | "signup">(initialTab);
  const [showPw, setShowPw] = useState(false);
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [signupErr, setSignupErr] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // The sign-in panel has a second face: request a recovery link. Kept inside
  // the panel rather than added as a third tab so the tablist still describes
  // the two things a visitor comes here to do.
  const [forgot, setForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetErr, setResetErr] = useState<string | null>(null);

  // /reset-password sends people back here with ?reset=1 when their link has
  // expired, so open straight onto the request form. An emailed link that
  // could not be redeemed comes with ?expired=1 too (lib/auth/email-link.ts),
  // and the panel says so rather than leave the person wondering.
  const [linkExpired, setLinkExpired] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.has("expired")) setLinkExpired(true);
    if (q.has("reset")) {
      setTab("signin");
      setForgot(true);
    }
  }, []);
  const expiredNotice = linkExpired ? (
    <p className="notice notice--warning" role="status">
      That link has expired or was already used.{" "}
      {forgot
        ? "Enter your email and we will send you a code instead."
        : "Sign in, or choose Forgot password to get a code."}
    </p>
  ) : null;

  // The reset panel has two steps: ask for the email, then redeem the code that
  // arrives. Kept in one panel so the address stays on screen while the code is
  // typed — people check it against the message they are reading.
  const [resetStep, setResetStep] = useState<"request" | "code">("request");
  const [resetCode, setResetCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");

  async function onRequestReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResetErr(null);
    setResetMsg(null);
    setBusy(true);
    const res = await requestPasswordResetAction(resetEmail);
    setBusy(false);
    if (!res.ok) {
      setResetErr(res.error || "Could not send the reset code.");
      return;
    }
    setResetMsg(res.message || "Check your email.");
    setResetStep("code");
  }

  async function onVerifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResetErr(null);
    setBusy(true);
    const res = await verifyPasswordResetCodeAction(resetEmail, resetCode);
    setBusy(false);
    if (!res.ok) {
      setResetErr(res.error || "That code did not work.");
      return;
    }
    // The action has set the recovery marker; the page re-checks it server-side.
    window.location.href = "/reset-password";
  }
  const emailRef = useRef<HTMLInputElement>(null);

  // Shown only once the shop has real numbers to show (D-04).
  const showStats = stats.products > 0 && stats.sellers > 0;

  useEffect(() => {
    const t = setTimeout(() => emailRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  async function doLogin(nextEmail: string, nextPassword: string) {
    setBusy(true);
    setLoginErr(null);
    setNeedsConfirm(false);
    const res = await loginAction(nextEmail, nextPassword);
    setBusy(false);
    if (!res.ok) {
      setLoginErr(errorText(res.error, "Sign in failed."));
      setNeedsConfirm(!!res.needsEmailConfirm);
      toast(errorText(res.error, "Sign in failed."), "error");
      return;
    }
    toast(`Welcome back, ${res.name}.`, "success");
    router.push(HOME_BY_ROLE[res.role!]);
  }

  async function onResendConfirm() {
    if (!email.trim()) {
      setLoginErr("Enter your email to resend confirmation.");
      return;
    }
    setBusy(true);
    const res = await resendConfirmationAction(email);
    setBusy(false);
    if (!res.ok) {
      toast(errorText(res.error, "Could not resend confirmation."), "error");
      return;
    }
    toast(res.message || "Confirmation email sent.", "success");
  }

  async function onVerifySignupCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !confirmCode.trim()) {
      setLoginErr("Enter the code from your email.");
      return;
    }
    setBusy(true);
    setLoginErr(null);
    const res = await verifySignupCodeAction(email, confirmCode);
    setBusy(false);
    if (!res.ok) {
      setLoginErr(errorText(res.error, "That code did not work."));
      toast(errorText(res.error, "That code did not work."), "error");
      return;
    }
    toast(`Welcome, ${res.name}.`, "success");
    router.push(HOME_BY_ROLE[res.role!]);
  }

  async function onSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setSignupErr(null);
    const res = await signupAction(
      String(data.get("name") || ""),
      String(data.get("email") || ""),
      String(data.get("password") || ""),
      data.get("consent") === "on"
    );
    setBusy(false);
    if (!res.ok) {
      setSignupErr(errorText(res.error, "Could not create account."));
      toast(errorText(res.error, "Could not create account."), "error");
      return;
    }
    if (res.needsEmailConfirm) {
      toast(res.message || "Check your email for a confirmation code.", "success");
      setEmail(String(data.get("email") || "").trim().toLowerCase());
      setTab("signin");
      setNeedsConfirm(true);
      setLoginErr("Please confirm your email first");
      return;
    }
    toast("Account created. Signing you in…", "success");
    router.push(HOME_BY_ROLE[res.role!]);
  }

  return (
    <div className="page page--landing" id="main" tabIndex={-1}>
      <a className="skip-link" href="#auth-title">
        Skip to sign in
      </a>

      <div className="landing-shell">
        <aside className="landing-hero" aria-labelledby="hero-title">

          <div className="landing-hero__content">
            <a className="landing-brand" href="/" aria-label="InclusiveMarket home">
              <BrandMark className="landing-brand__mark" />
              <span className="landing-brand__name">InclusiveMarket</span>
            </a>

            <p className="landing-eyebrow">Part of InkluTrack</p>

            <h1 id="hero-title" className="landing-hero__title">
              Buy and sell products made by <span className="hl">PWD trainees</span> of AVRC Region&nbsp;IX.
            </h1>

            <p className="landing-hero__lede">
              Bags, clothes, crafts, food and more, made by persons with disabilities. Every sale is income for the
              person who made it.
            </p>

            <ul className="landing-benefits">
              <li>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                Pay cash on delivery, or online with GCash, Maya, GrabPay or card
              </li>
              <li>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                Sellers verify their PWD ID with AVRC staff; every listing is reviewed
              </li>
              <li>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                Larger text, high contrast and read-aloud on every page
              </li>
            </ul>

            {showStats ? (
              <dl className="landing-metrics">
                <div>
                  <dt>Products in the shop</dt>
                  <dd>{stats.products.toLocaleString("en-PH")}</dd>
                </div>
                <div>
                  <dt>PWD sellers</dt>
                  <dd>{stats.sellers.toLocaleString("en-PH")}</dd>
                </div>
                {stats.orders > 0 ? (
                  <div>
                    <dt>Orders so far</dt>
                    <dd>{stats.orders.toLocaleString("en-PH")}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>

          <div className="landing-hero__foot">
            <span className="muted">&copy; InclusiveMarket &middot; Run by AVRC Region IX</span>
            <span className="muted">ZPPSU-CICS capstone project</span>
          </div>
        </aside>

        <section className="landing-auth" aria-labelledby="auth-title">
          <div className="auth-card">
            <div className="auth-tabs" role="tablist" aria-label="Sign in or create account">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "signin"}
                aria-controls="panel-signin"
                id="tab-signin"
                tabIndex={tab === "signin" ? 0 : -1}
                onClick={() => setTab("signin")}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "signup"}
                aria-controls="panel-signup"
                id="tab-signup"
                tabIndex={tab === "signup" ? 0 : -1}
                onClick={() => setTab("signup")}
              >
                Create account
              </button>
            </div>

            <div
              className="auth-panel"
              id="panel-signin"
              role="tabpanel"
              aria-labelledby="tab-signin"
              hidden={tab !== "signin"}
            >
              {forgot ? (
                <>
                  <h2 id="auth-title">Reset your password</h2>
                  <p className="muted">
                    {resetStep === "request"
                      ? "Enter the email address on your account. We will email you a sign-in code."
                      : "Enter the code we emailed you. It expires in one hour."}
                  </p>
                  {resetStep === "request" ? expiredNotice : null}

                  <form
                    className="form"
                    noValidate
                    onSubmit={resetStep === "request" ? onRequestReset : onVerifyCode}
                  >
                    {resetErr ? (
                      <p className="form-error" role="alert">
                        {resetErr}
                      </p>
                    ) : null}

                    {resetMsg ? (
                      <p className="form-success" role="status">
                        {resetMsg}
                      </p>
                    ) : null}

                    <div className="field">
                      <label htmlFor="reset-email">Email address</label>
                      <div className="input-icon">
                        <svg className="leading" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                        <input
                          id="reset-email"
                          name="email"
                          type="email"
                          autoComplete="username"
                          required
                          placeholder="you@example.com"
                          value={resetEmail}
                          readOnly={resetStep === "code"}
                          onChange={(e) => setResetEmail(e.target.value)}
                        />
                      </div>
                    </div>

                    {resetStep === "code" ? (
                      <div className="field">
                        <label htmlFor="reset-code">Code from your email</label>
                        <input
                          id="reset-code"
                          name="code"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          pattern="[0-9]*"
                          maxLength={12}
                          required
                          autoFocus
                          placeholder="12345678"
                          className="otp-input"
                          value={resetCode}
                          onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
                        />
                      </div>
                    ) : null}

                    <button type="submit" className="btn btn--primary" disabled={busy}>
                      {busy
                        ? resetStep === "request"
                          ? "Sending…"
                          : "Checking…"
                        : resetStep === "request"
                          ? "Send code"
                          : "Continue"}
                    </button>

                    <p className="hint">
                      {resetStep === "code" ? (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => {
                            setResetStep("request");
                            setResetCode("");
                            setResetErr(null);
                            setResetMsg(null);
                          }}
                        >
                          Use a different email
                        </button>
                      ) : null}{" "}
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => {
                          setForgot(false);
                          setResetStep("request");
                          setResetCode("");
                          setResetMsg(null);
                          setResetErr(null);
                        }}
                      >
                        Back to sign in
                      </button>
                    </p>
                  </form>
                </>
              ) : (
                <>
              <h2 id="auth-title">Welcome back</h2>
              <p className="muted">Sign in with your email and password.</p>
              {expiredNotice}

              <form
                className="form"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (needsConfirm && confirmCode) {
                    void onVerifySignupCode(e);
                    return;
                  }
                  doLogin(email, password);
                }}
              >
                {loginErr ? (
                  <p className="form-error" role="alert">
                    {loginErr}
                  </p>
                ) : null}

                <div className="field">
                  <label htmlFor="login-email">Email address</label>
                  <div className="input-icon">
                    <svg className="leading" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="username"
                      required
                      placeholder="you@example.com"
                      ref={emailRef}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                {needsConfirm ? (
                  <>
                    <div className="field">
                      <label htmlFor="signup-code">Confirmation code</label>
                      <input
                        id="signup-code"
                        name="signup-code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]*"
                        maxLength={12}
                        placeholder="12345678"
                        className="otp-input"
                        value={confirmCode}
                        onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                    <p className="hint" role="status">
                      Enter the code we emailed you, or{" "}
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={busy}
                        onClick={onResendConfirm}
                      >
                        resend confirmation
                      </button>
                    </p>
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={busy || !confirmCode}
                      onClick={(e) => void onVerifySignupCode(e)}
                    >
                      {busy ? "Checking…" : "Confirm email"}
                    </button>
                  </>
                ) : null}

                <div className="field">
                  <label htmlFor="login-password">Password</label>
                  <div className="input-icon">
                    <svg className="leading" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    <input
                      id="login-password"
                      name="password"
                      type={showPw ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="trailing"
                      aria-label={showPw ? "Hide password" : "Show password"}
                      aria-pressed={showPw}
                      onClick={() => setShowPw((s) => !s)}
                    >
                      {showPw ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a20.5 20.5 0 0 1 5.06-6" /><path d="M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a20.5 20.5 0 0 1-3.2 4.34" /><path d="M1 1l22 22" /></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" /><circle cx="12" cy="12" r="3" /></svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="field-row">
                  <label>
                    <input type="checkbox" defaultChecked /> Remember me
                  </label>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setResetEmail(email);
                      setForgot(true);
                    }}
                  >
                    Forgot password?
                  </button>
                </div>

                <button type="submit" className="btn btn--primary" disabled={busy}>
                  Sign in to InclusiveMarket
                </button>
              </form>
                </>
              )}
            </div>

            <div
              className="auth-panel"
              id="panel-signup"
              role="tabpanel"
              aria-labelledby="tab-signup"
              hidden={tab !== "signup"}
            >
              <h2>Create a buyer account</h2>
              <p className="muted">
                Create a buyer account to shop. We will email you a code to confirm your address before you sign in.
              </p>
              <p className="muted">
                PWD trainee who wants to sell? Seller accounts are not made here — <a href="/contact">contact AVRC staff</a>{" "}
                to set one up.
              </p>

              <form className="form" noValidate onSubmit={onSignup}>
                {signupErr ? (
                  <p className="form-error" role="alert">
                    {signupErr}
                  </p>
                ) : null}

                <div className="row">
                  <div className="field">
                    <label htmlFor="su-name">Full name</label>
                    <div className="input-icon">
                      <svg className="leading" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                      <input id="su-name" name="name" required maxLength={80} autoComplete="name" placeholder="Juan dela Cruz" />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="su-email">Email</label>
                    <div className="input-icon">
                      <svg className="leading" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                      <input id="su-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
                    </div>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="su-password">Password</label>
                  <div className="input-icon">
                    <svg className="leading" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    <input id="su-password" name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
                  </div>
                </div>

                <label className="consent">
                  <input type="checkbox" id="su-consent" name="consent" required />
                  <span>
                    I have read and agree to the Data Privacy notice (<strong>RA 10173</strong>). I consent
                    to the collection and processing of my registration data for InclusiveMarket.
                  </span>
                </label>

                <button type="submit" className="btn btn--primary" disabled={busy}>
                  Create account
                </button>
              </form>
            </div>
          </div>

          <p className="landing-legal">
            <a href="/privacy">Privacy Policy</a> &middot; <a href="/terms">Terms of use</a> &middot;{" "}
            <a href="/accessibility">Accessibility</a>
          </p>
        </section>
      </div>
    </div>
  );
}

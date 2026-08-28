#!/usr/bin/env node
/**
 * Send one real transactional email through the configured provider.
 *
 *   npm run test-email -- you@example.com
 *
 * This is the counterpart to `npm run verify`. Verify proves our code is
 * structurally intact; it cannot prove a message leaves the building. Only an
 * actual send does that, and the failures that matter here — an unverified
 * sending domain, a revoked key, a provider-side account block — are all
 * invisible until you try.
 *
 * Deliberately mirrors lib/email/{resend,brevo}.ts byte for byte in the request
 * it makes. If this succeeds, the transport succeeds; if it fails, the reason
 * printed here is the reason the app would have logged.
 *
 * Read-only with respect to your config: it never writes an env file and never
 * prints a key.
 */
import { readFileSync } from "node:fs";

// --- env ---------------------------------------------------------------------
for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // absent is fine — the value may come from the real environment
  }
}

const RESET = "[0m";
const c = (n, s) => `[${n}m${s}${RESET}`;
const ok = (s) => c(32, s);
const bad = (s) => c(31, s);
const warn = (s) => c(33, s);
const dim = (s) => c(90, s);

const mask = (k) => (k && k.length > 12 ? `${k.slice(0, 6)}…${k.slice(-4)}` : "(set)");

function die(message, hint) {
  console.log(`\n${bad("FAILED")}  ${message}`);
  if (hint) console.log(`${dim("        → " + hint)}`);
  console.log();
  process.exit(1);
}

// --- recipient ---------------------------------------------------------------
const to = process.argv[2];
if (!to || !to.includes("@")) {
  console.log(`
${bad("Give me a recipient.")}

    npm run test-email -- you@example.com

Which address? That depends on whether you have a verified sending domain:

  ${warn("No verified domain")} — it MUST be the email address that owns the
  Resend account. Resend refuses every other recipient with a 403. This is the
  single most common "why did nothing arrive" moment.

  ${ok("Verified domain")} — any address you like.
`);
  process.exit(1);
}

// --- provider selection: mirrors activeProvider() in lib/email/send.ts --------
function activeProvider() {
  const pinned = (process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  if (pinned === "resend") return "resend";
  if (pinned === "brevo") return "brevo";
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return "resend";
  if (process.env.BREVO_API_KEY && (process.env.EMAIL_FROM || process.env.BREVO_SENDER_EMAIL))
    return "brevo";
  return "none";
}

const provider = activeProvider();
const fromEmail = process.env.EMAIL_FROM || process.env.BREVO_SENDER_EMAIL || "";
const fromName = process.env.EMAIL_FROM_NAME || process.env.BREVO_SENDER_NAME || "IncluMarket";

console.log(`
${c(1, "IncluMarket — transactional email test")}

  provider   ${provider === "none" ? bad(provider) : ok(provider)}
  from       ${fromEmail || bad("(EMAIL_FROM is not set)")}
  from name  ${fromName}
  to         ${to}
`);

if (provider === "none") {
  die(
    "no email provider is configured.",
    "Set EMAIL_PROVIDER=resend and RESEND_API_KEY in .env.local. The app treats this as a soft failure — sends are logged as skipped and checkout still succeeds — so nothing else will tell you."
  );
}

// --- the message -------------------------------------------------------------
const stamp = new Date().toISOString();
const subject = `IncluMarket test — ${stamp}`;
const text = [
  "This is a test message from the IncluMarket email layer.",
  "",
  `Provider: ${provider}`,
  `Sent:     ${stamp}`,
  "",
  "If you are reading this, the credential, the sending identity and the",
  "provider are all working. Order receipts, seller notices and password",
  "recovery links use this same path.",
].join("\n");

const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#212529">
<h2 style="color:#0038A8;margin:0 0 .5rem">IncluMarket email test</h2>
<p>This is a test message from the IncluMarket email layer.</p>
<table style="border-collapse:collapse;font-size:14px">
<tr><td style="padding:2px 12px 2px 0;color:#6c757d">Provider</td><td><strong>${provider}</strong></td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#6c757d">Sent</td><td>${stamp}</td></tr>
</table>
<p>If you are reading this, the credential, the sending identity and the provider
are all working. Order receipts, seller notices and password recovery links use
this same path.</p>
</body></html>`;

// --- send --------------------------------------------------------------------
async function sendResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    die(
      "EMAIL_PROVIDER=resend but RESEND_API_KEY is empty.",
      "Creating the key in the Resend dashboard does not put it in .env.local. Copy it from https://resend.com/api-keys and paste it after RESEND_API_KEY= — a Resend key is shown ONCE, at creation, and cannot be read back later. If you have lost it, create a new one."
    );
  }
  if (!key.startsWith("re_")) {
    console.log(warn(`  note: RESEND_API_KEY (${mask(key)}) does not start with re_.\n`));
  }
  if (!fromEmail) die("EMAIL_FROM is not set.");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      html,
      text,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const body = await res.json().catch(() => ({}));

  if (res.ok) return body?.id;

  const detail = body?.message || body?.error || JSON.stringify(body);

  if (res.status === 401 || res.status === 403) {
    const domain = fromEmail.split("@")[1] ?? "";
    if (/domain is not verified|not verified/i.test(detail)) {
      die(
        `HTTP ${res.status} — ${detail}`,
        `The sending domain ${domain} is not verified. Either verify it at resend.com/domains, or set EMAIL_FROM=onboarding@resend.dev.`
      );
    }
    if (/testing emails|own email address|can only send/i.test(detail)) {
      die(
        `HTTP ${res.status} — ${detail}`,
        `With no verified domain, Resend only delivers to the address that owns the account. Re-run with that address, or verify a domain to reach real buyers and sellers.`
      );
    }
    die(
      `HTTP ${res.status} — ${detail}`,
      res.status === 401
        ? "The key is wrong or was revoked. Create a fresh one at resend.com/api-keys."
        : undefined
    );
  }

  if (res.status === 429) {
    die(`HTTP 429 — ${detail}`, "Rate limited by Resend. Wait a moment and retry.");
  }

  die(`HTTP ${res.status} — ${detail}`);
}

async function sendBrevo() {
  const key = process.env.BREVO_API_KEY;
  if (!key) die("EMAIL_PROVIDER=brevo but BREVO_API_KEY is empty.");
  if (key.startsWith("xsmtpsib-")) {
    die(
      `BREVO_API_KEY is an SMTP key (${mask(key)}).`,
      "The v3 API needs an API key (xkeysib-…), created under SMTP & API → API Keys. They look alike and are not interchangeable."
    );
  }
  if (!fromEmail) die("neither EMAIL_FROM nor BREVO_SENDER_EMAIL is set.");

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const body = await res.json().catch(() => ({}));
  if (res.ok) return body?.messageId;

  const detail = body?.message || JSON.stringify(body);
  if (res.status === 401 && /unrecognised ip|unrecognized ip|authorised_ip/i.test(detail)) {
    die(
      `HTTP 401 — ${detail}`,
      "Brevo is blocking this IP at the account level. This blocks Vercel too — serverless egress IPs are dynamic and cannot be allow-listed. Switch to EMAIL_PROVIDER=resend."
    );
  }
  die(`HTTP ${res.status} — ${detail}`);
}

const id = provider === "resend" ? await sendResend() : await sendBrevo();

console.log(`${ok("SENT")}  accepted by ${provider}${id ? `, id ${id}` : ""}.

${dim("Accepted means the provider took it, not that it landed in an inbox.")}
${dim("Check " + to + " — including spam — and the provider's own log:")}
${dim(provider === "resend" ? "  https://resend.com/emails" : "  https://app.brevo.com/statistics/email")}
`);

// --- the OTHER mail path ------------------------------------------------------
//
// Everything above tests lib/email/*, which sends receipts, seller notices and
// ticket replies. It does NOT test signup confirmation or password recovery.
//
// Those are sent by Supabase Auth's own mailer, inside Supabase, and they
// ignore EMAIL_PROVIDER entirely. A perfectly healthy Resend setup therefore
// tells you nothing about whether a reset link can reach anybody — which is
// exactly the trap this section exists to spring.
//
// Probed with admin.generateLink, which MINTS a recovery link without sending
// one, so this stays a test and not a live email to a real person.
await probeAuthMail();

async function probeAuthMail() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url || !serviceKey || !site) return;

  console.log(`${c(1, "Supabase Auth mail (signup confirmation + password recovery)")}\n`);

  const redirectTo = `${site}/auth/callback?next=/reset-password`;
  const api = (path, body) =>
    fetch(`${url}/auth/v1/${path}`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

  // Does the app's redirect target survive the Redirect URLs allow-list? When
  // it does not, Supabase silently substitutes the Site URL — the link still
  // arrives, still works, and lands on the wrong page, with no error anywhere.
  const res = await api("admin/generate_link", { type: "recovery", email: to, redirect_to: redirectTo });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = body?.msg || body?.message || JSON.stringify(body);
    if (/user not found/i.test(msg)) {
      console.log(`  ${warn("skipped")} ${to} has no account, so no recovery link can be minted.`);
      console.log(`  ${dim("Re-run with an address that has signed up to check this path.")}\n`);
      return;
    }
    console.log(`  ${bad("FAILED")} could not mint a recovery link: HTTP ${res.status} ${msg}\n`);
    return;
  }

  const got = new URL(body.action_link).searchParams.get("redirect_to");
  if (got === redirectTo) {
    console.log(`  ${ok("ok")}     redirect target is allow-listed (${redirectTo}).`);
  } else {
    console.log(`  ${bad("FAILED")} redirect target was rejected and replaced.`);
    console.log(`  ${dim("         sent:     " + redirectTo)}`);
    console.log(`  ${dim("         used:     " + got)}`);
    console.log(
      `  ${dim("         Add it under Supabase -> Authentication -> URL Configuration -> Redirect URLs.")}`
    );
  }

  // Minting proves the link. Delivery is a separate question, and the only
  // honest way to answer it is to ask Supabase to actually send one.
  console.log(`  ${dim("Link minting works. Delivery is separate — testing that now.")}`);

  const recover = () =>
    fetch(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: to }),
      signal: AbortSignal.timeout(20000),
    });

  let send = await recover();

  // Supabase enforces a per-address cooldown of about a minute. Running this
  // script twice in a row therefore answers 429 and tells you nothing about
  // the mailer — which is the one question the section exists to answer. Wait
  // it out once rather than reporting an inconclusive result as if it were a
  // finding. A second 429 is real and gets reported.
  if (send.status === 429) {
    const body429 = await send.clone().text();
    const secs = Math.min(Number(body429.match(/after (\d+) seconds/)?.[1] ?? 60) + 5, 90);
    process.stdout.write(`  ${dim(`cooldown active — waiting ${secs}s so this run can answer...`)}`);
    await new Promise((r) => setTimeout(r, secs * 1000));
    process.stdout.write("\r\u001b[2K");
    send = await recover();
  }

  if (send.ok) {
    console.log(`  ${ok("ok")}     Supabase accepted the recovery email for ${to}.`);
    console.log(
      `  ${dim("That means the SMTP handoff succeeded — with custom SMTP configured,")}`
    );
    console.log(`  ${dim("the message is now your provider's to deliver. Check the inbox.")}\n`);
    return;
  }

  const sendBody = await send.json().catch(() => ({}));
  const msg = sendBody?.msg || sendBody?.message || JSON.stringify(sendBody);

  if (send.status >= 500) {
    console.log(`  ${bad("FAILED")} Supabase could not send it: HTTP ${send.status} ${msg}`);
    console.log(`  ${dim("         A 5xx here is the auth mailer itself failing, not your code.")}`);
    console.log(`  ${dim("         Auth emails ignore EMAIL_PROVIDER. Point Supabase at Resend:")}`);
    console.log(`  ${dim("           Supabase -> Project Settings -> Authentication -> SMTP Settings")}`);
    console.log(`  ${dim("           host smtp.resend.com   port 465   user resend")}`);
    console.log(`  ${dim("           password <your RESEND_API_KEY>   sender " + fromEmail)}\n`);
    return;
  }

  if (send.status === 429) {
    console.log(`  ${warn("limited")} HTTP 429 ${msg}`);
    console.log(`  ${dim("         Supabase's built-in mailer allows very few sends per hour.")}`);
    console.log(`  ${dim("         Custom SMTP removes this limit.")}\n`);
    return;
  }

  console.log(`  ${bad("FAILED")} HTTP ${send.status} ${msg}\n`);
}

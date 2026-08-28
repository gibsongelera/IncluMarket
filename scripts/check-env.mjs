/**
 * Health-check every configured integration.
 *
 * Read-only: it authenticates against each provider and reads back account or
 * configuration state. It never charges, sends, writes or deletes anything.
 *
 * Secrets are never printed — only their length and a short prefix, which is
 * enough to tell a PayMongo test key from a live one, or a Brevo SMTP key from
 * an API key, without exposing the value.
 *
 * Usage:
 *   npm run check-env
 *   npm run check-env -- --site https://inclumarket.vercel.app
 */

const args = process.argv.slice(2);
const SITE =
  args.includes("--site") ? args[args.indexOf("--site") + 1] : process.env.NEXT_PUBLIC_SITE_URL;

const results = [];
const add = (area, level, message, hint) => results.push({ area, level, message, hint });

const mask = (v) => (!v ? "(unset)" : `${v.slice(0, 8)}… ${v.length} chars`);

async function json(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, ok: res.ok, body };
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------
async function checkSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) return add("Supabase", "error", "NEXT_PUBLIC_SUPABASE_URL is not set.");
  if (!anon) add("Supabase", "error", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set.");
  if (!service) return add("Supabase", "error", "SUPABASE_SERVICE_ROLE_KEY is not set.");

  // A connection string here is the incident that must never recur.
  const legacy = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (legacy && legacy.startsWith("postgres")) {
    add(
      "Supabase",
      "error",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY holds a Postgres connection string.",
      "NEXT_PUBLIC_ is inlined into the browser bundle. Remove it and rotate the database password."
    );
  }

  const r = await json(`${url}/rest/v1/im_profiles?select=id&limit=1`, {
    headers: { apikey: service, Authorization: `Bearer ${service}` },
  });
  if (r.ok) add("Supabase", "ok", `service-role key works (${url}).`);
  else
    add(
      "Supabase",
      "error",
      `service-role key rejected: HTTP ${r.status} ${r.body?.message ?? ""}`.trim(),
      "Check the key in Supabase → Settings → API."
    );

  // The publishable key should be constrained by RLS, not omnipotent.
  const pub = await json(`${url}/rest/v1/im_profiles?select=email&limit=1`, {
    headers: { apikey: anon ?? "", Authorization: `Bearer ${anon ?? ""}` },
  });
  if (pub.ok && Array.isArray(pub.body) && pub.body.length > 0) {
    add(
      "Supabase",
      "error",
      "The PUBLIC key can read im_profiles rows.",
      "Migration 0009 restricts this to own-row or admin. Run it against this project."
    );
  } else {
    add("Supabase", "ok", "public key cannot read profile rows (RLS holding).");
  }

  // Every function in `public` is granted EXECUTE to PUBLIC by default, and
  // PostgREST exposes any non-trigger function as /rest/v1/rpc/<name>. So a
  // SECURITY DEFINER helper is a privileged endpoint reachable with the
  // publishable key until the grant is revoked. Probe rather than read the
  // catalogue: what matters is what an attacker can actually call.
  //
  // im_current_profile_role and im_current_profile_id are deliberately absent
  // from this list. They are called from inside RLS policy expressions, which
  // run with the querying role's privileges, so revoking EXECUTE would break
  // every policy that calls them rather than hardening anything. See 0012.
  const MUST_NOT_BE_CALLABLE = [
    ["im_requesting_role", {}],
    ["im_rate_limit_hit", { p_bucket: "probe", p_identifier: "probe", p_window_seconds: 60, p_max_hits: 1 }],
    ["im_decrement_variant_stock", { p_variant_id: 0, p_qty: 1 }],
    ["im_restore_variant_stock", { p_variant_id: 0, p_qty: 1 }],
  ];

  let exposed = 0;
  for (const [fn, body] of MUST_NOT_BE_CALLABLE) {
    const probe = await json(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: anon ?? "", Authorization: `Bearer ${anon ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (probe.ok) {
      exposed++;
      add(
        "Supabase",
        "error",
        `SECURITY DEFINER function ${fn}() is callable with the PUBLIC key.`,
        "Run migration 0012, which revokes EXECUTE from public, anon and authenticated."
      );
    }
  }
  if (!exposed) {
    add("Supabase", "ok", "no privileged RPC is reachable with the public key.");
  }

  // The curated view is the sanctioned way to read seller info publicly; if it
  // stops working the storefront loses its featured sellers.
  const view = await json(`${url}/rest/v1/im_public_sellers?select=id&limit=1`, {
    headers: { apikey: anon ?? "", Authorization: `Bearer ${anon ?? ""}` },
  });
  add(
    "Supabase",
    view.ok ? "ok" : "warn",
    view.ok
      ? "im_public_sellers is readable by the public key (as intended)."
      : `im_public_sellers is not readable: HTTP ${view.status}.`
  );
}

// ---------------------------------------------------------------------------
// PayMongo
// ---------------------------------------------------------------------------
async function checkPayMongo() {
  const secret = process.env.PAYMONGO_SECRET_KEY;
  const pub = process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY;
  const hook = process.env.PAYMONGO_WEBHOOK_SECRET;
  const mode = process.env.PAYMONGO_ENV || "test";

  if (!secret) return add("PayMongo", "error", "PAYMONGO_SECRET_KEY is not set.");
  if (!pub) add("PayMongo", "warn", "NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY is not set.");
  if (!hook) add("PayMongo", "error", "PAYMONGO_WEBHOOK_SECRET is not set — every webhook will be rejected.");

  const secretMode = secret.startsWith("sk_live_") ? "live" : secret.startsWith("sk_test_") ? "test" : "unknown";
  const pubMode = !pub ? "unknown" : pub.startsWith("pk_live_") ? "live" : pub.startsWith("pk_test_") ? "test" : "unknown";

  if (secretMode !== mode) {
    add(
      "PayMongo",
      "error",
      `PAYMONGO_ENV is "${mode}" but the secret key is a ${secretMode} key.`,
      "PAYMONGO_ENV selects which signature field the webhook verifies (te= for test, li= for live). A mismatch rejects every delivery."
    );
  } else {
    add("PayMongo", "ok", `keys and PAYMONGO_ENV agree (${mode} mode).`);
  }
  if (pubMode !== "unknown" && pubMode !== secretMode) {
    add("PayMongo", "error", `public key is ${pubMode} but secret key is ${secretMode}.`);
  }

  // Read-only: lists webhooks. Also tells us whether the endpoint is registered.
  const auth = `Basic ${Buffer.from(`${secret}:`).toString("base64")}`;
  const r = await json("https://api.paymongo.com/v1/webhooks", { headers: { Authorization: auth } });

  if (!r.ok) {
    add(
      "PayMongo",
      "error",
      `secret key rejected: HTTP ${r.status} ${r.body?.errors?.[0]?.detail ?? ""}`.trim()
    );
    return;
  }
  add("PayMongo", "ok", "secret key authenticates.");

  const hooks = r.body?.data ?? [];

  // PayMongo scopes webhooks PER MODE, and the dashboard has its own test/live
  // toggle that is independent of which key you are using. A webhook created
  // while the dashboard sits in Live mode is invisible to a test key and never
  // fires for a test payment — but the dashboard still shows it, so it looks
  // registered. Stating the mode here is what makes that gap visible.
  add(
    "PayMongo",
    "ok",
    `the webhook list below is ${mode.toUpperCase()} mode only (your key is a ${secretMode} key).`,
    "The dashboard has its own test/live toggle. A webhook created in the other mode will not appear here and will never fire for payments made with this key."
  );

  if (!hooks.length) {
    add(
      "PayMongo",
      "error",
      `no webhook registered in ${mode.toUpperCase()} mode.`,
      `Without it orders never leave 'pending' after payment. Switch the dashboard to ${mode === "test" ? "Test" : "Live"} mode, then add <SITE>/api/webhooks/paymongo.`
    );
    return;
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL || "";
  const sameHost = (a, b) => {
    try {
      return !b || new URL(a).host === new URL(b).host;
    } catch {
      return true;
    }
  };
  const ours = hooks.filter((h) => sameHost(h.attributes?.url ?? "", site));

  if (!ours.length) {
    add(
      "PayMongo",
      "error",
      `no webhook for ${site} in ${mode.toUpperCase()} mode.`,
      `Other projects on this account do not count. Switch the dashboard to ${mode === "test" ? "Test" : "Live"} mode and add ${site}/api/webhooks/paymongo — paid orders stay 'pending' without it.`
    );
  }

  for (const h of hooks) {
    const a = h.attributes ?? {};
    const url = a.url ?? "(no url)";
    const events = (a.events ?? []).join(", ");
    const live = a.status === "enabled";
    const isLocal = /localhost|127\.0\.0\.1/.test(url);
    const correctPath = url.includes("/api/webhooks/paymongo");

    if (!sameHost(url, site)) {
      // Another project on the same PayMongo account. Only a problem if THIS
      // site has no webhook of its own — reported once, after the loop.
      add("PayMongo", "ok", `(another project on this account: ${url} — not ours, left alone)`);
      continue;
    }

    add(
      "PayMongo",
      live && correctPath && !isLocal ? "ok" : "warn",
      `webhook ${live ? "enabled" : a.status}: ${url}`,
      !correctPath
        ? "Path should end /api/webhooks/paymongo"
        : isLocal
          ? "Points at localhost — PayMongo cannot reach it from the internet."
          : undefined
    );
    if (!/checkout_session\.payment\.paid/.test(events)) {
      add(
        "PayMongo",
        "warn",
        `webhook events: ${events || "(none)"}`,
        "checkout_session.payment.paid is the one that marks an order paid."
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Transactional email
//
// Two transports exist (lib/email/resend.ts, lib/email/brevo.ts) behind
// lib/email/send.ts. Provider selection here mirrors activeProvider() exactly —
// if these two ever disagree, this script validates a provider the app will not
// actually use, which is worse than not checking at all.
// ---------------------------------------------------------------------------
function activeEmailProvider() {
  const pinned = (process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  if (pinned === "resend") return "resend";
  if (pinned === "brevo") return "brevo";
  const resendReady = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  const brevoReady = Boolean(
    process.env.BREVO_API_KEY && (process.env.EMAIL_FROM || process.env.BREVO_SENDER_EMAIL)
  );
  if (resendReady) return "resend";
  if (brevoReady) return "brevo";
  return "none";
}

async function checkEmail() {
  const provider = activeEmailProvider();
  const pinned = (process.env.EMAIL_PROVIDER || "").trim().toLowerCase();

  if (pinned && !["resend", "brevo", "none"].includes(pinned)) {
    add(
      "Email",
      "warn",
      `EMAIL_PROVIDER="${pinned}" is not recognised — the app falls back to auto-detect.`,
      "Valid values: resend, brevo, or blank."
    );
  }

  if (provider === "none") {
    return add(
      "Email",
      "error",
      "no email provider is configured — order receipts and seller notices will not be sent.",
      "Set RESEND_API_KEY + EMAIL_FROM (recommended), or BREVO_API_KEY. Sends are logged as skipped and never fail a checkout, so this degrades silently."
    );
  }

  add("Email", "ok", `provider: ${provider}`);
  return provider === "resend" ? checkResend() : checkBrevo();
}

async function checkResend() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!key) {
    return add(
      "Email",
      "error",
      "EMAIL_PROVIDER=resend but RESEND_API_KEY is not set.",
      "Create one at https://resend.com/api-keys."
    );
  }
  if (!from) add("Email", "error", "EMAIL_FROM is not set.");
  if (!key.startsWith("re_")) {
    add(
      "Email",
      "warn",
      `RESEND_API_KEY has an unfamiliar prefix (${mask(key)}) — Resend keys start with re_.`
    );
  }

  const r = await json("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });

  // Resend issues keys at two permission levels, and this probe reads domains,
  // which only a full-access key may do. A "Sending access" key answers 401
  // with a message saying exactly that — it is a VALID key doing its job, and
  // it is the better one to deploy: it cannot enumerate or alter the account.
  // Treating that 401 as a dead key would send you hunting a non-existent bug.
  const restricted = /restricted to only send/i.test(r.body?.message ?? "");

  if (!r.ok && !restricted) {
    return add(
      "Email",
      "error",
      `RESEND_API_KEY rejected: HTTP ${r.status} ${r.body?.message ?? ""}`.trim(),
      r.status === 401 ? "The key is wrong or was revoked." : undefined
    );
  }

  if (restricted) {
    // No domain list is readable, so the verification check below cannot run.
    // Say so in the hint rather than staying silent: an unverified sending
    // domain is the commonest reason mail never arrives, and silence here
    // would read as "verified".
    add(
      "Email",
      "ok",
      "RESEND_API_KEY works — a sending-only key (least privilege).",
      `A sending-only key cannot list domains, so this script cannot confirm ${(from ?? "").split("@")[1] || "the EMAIL_FROM domain"} is verified. npm run test-email -- <you@address> settles it either way.`
    );
    if ((from ?? "").endsWith("@resend.dev")) {
      add(
        "Email",
        "warn",
        `EMAIL_FROM is ${from}, the shared Resend test sender.`,
        "Delivery is restricted to the address that owns the Resend account. Real buyers and sellers will NOT receive mail. Verify a domain at resend.com/domains before the defence."
      );
    }
    return;
  }

  add("Email", "ok", "RESEND_API_KEY works (full access).");

  // The sending-domain rule is where Resend surprises people: with no verified
  // domain you may only send FROM onboarding@resend.dev, and only TO the
  // address that owns the account. The wiring "works" while no buyer can
  // actually be reached — exactly the failure this script exists to catch.
  const domains = r.body?.data ?? [];
  const verified = domains.filter((d) => d.status === "verified").map((d) => d.name);
  const fromDomain = (from ?? "").split("@")[1]?.toLowerCase() ?? "";

  if (fromDomain === "resend.dev") {
    add(
      "Email",
      "warn",
      `EMAIL_FROM is ${from}, the shared Resend test sender.`,
      "Delivery is restricted to the address that owns the Resend account. Real buyers and sellers will NOT receive mail. Verify a domain at resend.com/domains before the defence."
    );
  } else if (!verified.includes(fromDomain)) {
    add(
      "Email",
      "error",
      `EMAIL_FROM (${from}) is not on a verified Resend domain.`,
      `Verified: ${verified.join(", ") || "(none)"}. Resend refuses the send with 403. Either verify ${fromDomain || "the domain"}, or set EMAIL_FROM=onboarding@resend.dev for testing.`
    );
  } else {
    add("Email", "ok", `sender domain ${fromDomain} is verified.`);
  }

  const pending = domains
    .filter((d) => d.status !== "verified")
    .map((d) => `${d.name} (${d.status})`);
  if (pending.length) add("Email", "warn", `unverified domains in Resend: ${pending.join(", ")}.`);
}

async function checkBrevo() {
  const key = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM || process.env.BREVO_SENDER_EMAIL;

  if (!key) return add("Email", "error", "EMAIL_PROVIDER=brevo but BREVO_API_KEY is not set.");
  if (!from) add("Email", "error", "neither EMAIL_FROM nor BREVO_SENDER_EMAIL is set.");

  // The single most common Brevo mistake: an SMTP key where an API key is
  // needed. They look similar and are not interchangeable.
  if (key.startsWith("xsmtpsib-")) {
    add(
      "Email",
      "error",
      `BREVO_API_KEY is an SMTP key (${mask(key)}).`,
      "lib/email/brevo.ts calls the HTTP API v3, which only accepts an API key (xkeysib-…). Create one under SMTP & API → API Keys."
    );
  } else if (!key.startsWith("xkeysib-")) {
    add("Email", "warn", `BREVO_API_KEY has an unfamiliar prefix (${mask(key)}).`);
  }

  const r = await json("https://api.brevo.com/v3/account", {
    headers: { "api-key": key, Accept: "application/json" },
  });

  if (r.ok) {
    add("Email", "ok", `Brevo API key works (account: ${r.body?.email ?? "unknown"}).`);
  } else {
    const msg = r.body?.message ?? "";
    // Brevo can 401 for a bad key OR because the account restricts calls to an
    // allow-list of IPs. Very different fixes, and the second one is the more
    // dangerous of the two: it also blocks the deployment, whose egress IPs are
    // dynamic and cannot be listed.
    if (/unrecognised ip|unrecognized ip|authorised_ip|authorized_ip/i.test(msg)) {
      const ip = msg.match(/\d{1,3}(?:\.\d{1,3}){3}/)?.[0] ?? "this machine";
      add(
        "Email",
        "error",
        `the Brevo key is valid, but Brevo is blocking ${ip} by IP allow-list.`,
        "This blocks Vercel too: serverless egress IPs are dynamic and cannot be allow-listed. If the setting at app.brevo.com/security/authorised_ips is already off and the block persists, it is account-level — switch to EMAIL_PROVIDER=resend."
      );
    } else {
      add(
        "Email",
        "error",
        `Brevo API key rejected: HTTP ${r.status} ${msg}`.trim(),
        "An SMTP key (xsmtpsib-) returns 401 here even though it works for SMTP relay."
      );
    }
    return;
  }

  // A sender that is not verified silently lands in spam, or is refused.
  const s = await json("https://api.brevo.com/v3/senders", {
    headers: { "api-key": key, Accept: "application/json" },
  });
  if (s.ok) {
    const senders = s.body?.senders ?? [];
    const match = senders.find((x) => (x.email ?? "").toLowerCase() === (from ?? "").toLowerCase());
    if (!match) {
      add(
        "Email",
        "error",
        `sender ${from} is not verified in Brevo.`,
        `Verified: ${senders.map((x) => x.email).join(", ") || "(none)"}. Add and verify it in Senders.`
      );
    } else if (match.active === false) {
      add("Email", "warn", `sender ${from} exists but is not active.`);
    } else {
      add("Email", "ok", `sender ${from} is verified.`);
    }
  }
}

// ---------------------------------------------------------------------------
// OpenRouter
// ---------------------------------------------------------------------------
async function checkOpenRouter() {
  const provider = (process.env.CHAT_PROVIDER || "").trim();
  const key = process.env.OPENROUTER_API_KEY;

  if (!provider) {
    add("OpenRouter", "ok", "CHAT_PROVIDER unset — using the built-in rule-based responder.");
    return;
  }
  if (!key) {
    return add("OpenRouter", "error", "CHAT_PROVIDER is set but OPENROUTER_API_KEY is not.");
  }

  const r = await json("https://openrouter.ai/api/v1/key", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!r.ok) {
    return add("OpenRouter", "error", `API key rejected: HTTP ${r.status}.`);
  }
  const d = r.body?.data ?? {};
  add(
    "OpenRouter",
    "ok",
    `API key works (usage ${d.usage ?? 0}${d.limit ? ` of ${d.limit}` : ", no hard limit"}).`
  );

  const models = (process.env.OPENROUTER_MODEL || "").split(",").map((m) => m.trim()).filter(Boolean);
  if (models.length > 3) {
    add(
      "OpenRouter",
      "warn",
      `${models.length} models configured; OpenRouter accepts at most 3.`,
      "The code caps it, so the extras are ignored."
    );
  }

  const list = await json("https://openrouter.ai/api/v1/models");
  if (list.ok) {
    const ids = new Set((list.body?.data ?? []).map((m) => m.id));
    for (const m of models.slice(0, 3)) {
      if (!ids.has(m)) add("OpenRouter", "error", `model "${m}" is not offered any more.`);
    }
    if (models.slice(0, 3).every((m) => ids.has(m))) {
      add("OpenRouter", "ok", `all ${Math.min(models.length, 3)} configured models exist.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Site URL + deployment
// ---------------------------------------------------------------------------
async function checkSite() {
  const local = process.env.NEXT_PUBLIC_SITE_URL;
  if (!local) add("Site", "error", "NEXT_PUBLIC_SITE_URL is not set.");
  else if (/localhost|127\.0\.0\.1/.test(local)) {
    add(
      "Site",
      "warn",
      `NEXT_PUBLIC_SITE_URL is ${local} (correct for local work).`,
      "In Vercel this MUST be the production URL: it builds the payment return URLs and the auth confirmation links. Left as localhost, paying users are redirected to their own machine."
    );
  } else {
    add("Site", "ok", `NEXT_PUBLIC_SITE_URL is ${local}.`);
  }

  if (!SITE || /localhost/.test(SITE)) return;

  try {
    const res = await fetch(SITE, { redirect: "manual", signal: AbortSignal.timeout(20000) });
    add("Deployment", res.status < 500 ? "ok" : "error", `${SITE} responded HTTP ${res.status}.`);

    const h = res.headers;
    for (const [name, label] of [
      ["strict-transport-security", "HSTS"],
      ["x-content-type-options", "nosniff"],
      ["x-frame-options", "frame options"],
      ["referrer-policy", "referrer policy"],
    ]) {
      add("Deployment", h.get(name) ? "ok" : "warn", `${label}: ${h.get(name) ?? "missing"}`);
    }
    const csp = h.get("content-security-policy") || h.get("content-security-policy-report-only");
    add("Deployment", csp ? "ok" : "warn", `CSP: ${csp ? (h.get("content-security-policy") ? "enforcing" : "report-only") : "missing"}`);

    const hook = await fetch(`${SITE}/api/webhooks/paymongo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(20000),
    });
    add(
      "Deployment",
      hook.status === 401 ? "ok" : "warn",
      `webhook endpoint returns HTTP ${hook.status} for an unsigned POST` +
        (hook.status === 401 ? " (correctly rejected)." : ".")
    );
  } catch (err) {
    add("Deployment", "error", `could not reach ${SITE}: ${String(err).slice(0, 80)}`);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
console.log("\nChecking configured integrations (read-only)…\n");

for (const [name, fn] of [
  ["Supabase", checkSupabase],
  ["PayMongo", checkPayMongo],
  ["Email", checkEmail],
  ["OpenRouter", checkOpenRouter],
  ["Site", checkSite],
]) {
  try {
    await fn();
  } catch (err) {
    add(name, "error", `check itself failed: ${String(err).slice(0, 120)}`);
  }
}

const ICON = { ok: "  ok  ", warn: " warn ", error: "FAIL  " };
let area = "";
for (const r of results) {
  if (r.area !== area) {
    area = r.area;
    console.log(`\n${area}`);
    console.log("-".repeat(70));
  }
  console.log(`  [${ICON[r.level]}] ${r.message}`);
  if (r.hint) console.log(`           ${r.hint}`);
}

const errors = results.filter((r) => r.level === "error").length;
const warns = results.filter((r) => r.level === "warn").length;
console.log(`\n${"=".repeat(70)}`);
console.log(`${errors} error(s), ${warns} warning(s)\n`);
process.exit(errors ? 1 : 0);

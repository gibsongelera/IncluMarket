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
  if (!hooks.length) {
    add(
      "PayMongo",
      "error",
      "no webhook is registered.",
      "Without it orders never leave 'pending' after payment. Register <SITE>/api/webhooks/paymongo in Developers → Webhooks."
    );
    return;
  }

  for (const h of hooks) {
    const a = h.attributes ?? {};
    const url = a.url ?? "(no url)";
    const events = (a.events ?? []).join(", ");
    const live = a.status === "enabled";
    const isLocal = /localhost|127\.0\.0\.1/.test(url);
    const correctPath = url.includes("/api/webhooks/paymongo");

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
// Brevo
// ---------------------------------------------------------------------------
async function checkBrevo() {
  const key = process.env.BREVO_API_KEY;
  const from = process.env.BREVO_SENDER_EMAIL;

  if (!key) return add("Brevo", "error", "BREVO_API_KEY is not set — no email will be sent.");
  if (!from) add("Brevo", "error", "BREVO_SENDER_EMAIL is not set.");

  // The single most common Brevo mistake: an SMTP key where an API key is
  // needed. They look similar and are not interchangeable.
  if (key.startsWith("xsmtpsib-")) {
    add(
      "Brevo",
      "error",
      `BREVO_API_KEY is an SMTP key (${mask(key)}).`,
      "lib/email/brevo.ts calls the HTTP API v3, which only accepts an API key (xkeysib-…). Create one under SMTP & API → API Keys."
    );
  } else if (!key.startsWith("xkeysib-")) {
    add("Brevo", "warn", `BREVO_API_KEY has an unfamiliar prefix (${mask(key)}).`);
  }

  const r = await json("https://api.brevo.com/v3/account", {
    headers: { "api-key": key, Accept: "application/json" },
  });

  if (r.ok) {
    add("Brevo", "ok", `API key works (account: ${r.body?.email ?? "unknown"}).`);
  } else {
    add(
      "Brevo",
      "error",
      `API key rejected: HTTP ${r.status} ${r.body?.message ?? ""}`.trim(),
      "An SMTP key returns 401 here even though it works for SMTP relay."
    );
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
        "Brevo",
        "error",
        `BREVO_SENDER_EMAIL (${from}) is not a verified sender.`,
        `Verified: ${senders.map((x) => x.email).join(", ") || "(none)"}. Add and verify it in Senders.`
      );
    } else if (match.active === false) {
      add("Brevo", "warn", `sender ${from} exists but is not active.`);
    } else {
      add("Brevo", "ok", `sender ${from} is verified.`);
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
  ["Brevo", checkBrevo],
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

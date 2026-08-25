#!/usr/bin/env node
/**
 * IncluMarket server-action guard audit.
 *
 * Every export of a "use server" module is a public, unauthenticated HTTP
 * endpoint. This lists them and reports any that touch the service-role client
 * without first establishing who is calling.
 *
 * It would have caught both of the real findings of this shape:
 *   - createNotification: documented "internal helper", zero auth, could write
 *     an attacker-controlled notification to any user id
 *   - listPaymentProviders: unauthenticated, returned config for all providers
 *
 * Zero dependencies. Run:
 *   node .claude/skills/inclumarket-security-audit/scripts/audit-actions.mjs
 *
 * Exit 0 = clean, 1 = findings.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const ACTIONS_DIR = path.join(ROOT, "lib", "actions");

/** Calls that establish the caller's identity or role. */
const GUARD_PATTERNS = [
  "getSession(",
  "requireRole(",
  "requireAdmin(",
  "requireSeller(",
  "requireBuyer(",
];

/** Reads that are intentionally public — documented exceptions, not oversights. */
const ALLOWED_UNGUARDED = new Map([
  ["search.ts:suggestProducts", "public catalog typeahead; rate-limited, approved products only"],
  ["newsletter.ts:subscribeNewsletter", "public signup; rate-limited, writes only an email"],
  ["chat.ts:sendChatMessage", "public support chat; rate-limited, ownership-checked per session"],
  ["chat.ts:fetchChatHistory", "public support chat; ownership-checked per session"],
  ["chat.ts:escalateChat", "public support chat; ownership-checked per session"],
  ["payments.ts:listEnabledPaymentProviders", "checkout needs the method list; narrow projection, no keys"],
  ["auth.ts:loginAction", "authentication entry point; rate-limited"],
  ["auth.ts:signupAction", "authentication entry point; rate-limited"],
  ["auth.ts:resendConfirmationAction", "authentication entry point; rate-limited"],
  ["auth.ts:logoutAction", "ends a session; nothing to guard"],
  ["auth.ts:redirectHomeForSession", "reads the session itself"],
]);

const findings = [];
const rows = [];

if (!fs.existsSync(ACTIONS_DIR)) {
  console.error(`No lib/actions directory at ${ACTIONS_DIR}`);
  process.exit(1);
}

const files = fs.readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".ts"));

for (const file of files) {
  const full = path.join(ACTIONS_DIR, file);
  const source = fs.readFileSync(full, "utf8");
  const isServerModule = /^\s*["']use server["']/m.test(source);

  if (!isServerModule) continue;

  // A "use server" module may only export async functions.
  for (const m of source.matchAll(/^export\s+(const|let|var|class)\s+(\w+)/gm)) {
    findings.push({
      file: `lib/actions/${file}`,
      symbol: m[2],
      level: "error",
      message: `"use server" modules may only export async functions; \`export ${m[1]} ${m[2]}\` will fail the build. Move it to a plain module.`,
    });
  }

  // A type-only RE-EXPORT is the subtler version of the same rule, and it does
  // not fail the type check — it fails at runtime.
  //
  //   export type { ReportType };   ->  ReferenceError: ReportType is not defined
  //
  // Turbopack's server-action transform enumerates the module's exports before
  // the type-only re-export is erased, so it emits a real binding for a name
  // that only ever existed as a type. Declaring types inline (`export interface
  // Foo {}` / `export type Foo = ...`) is fine; re-exporting an imported type
  // is not. Put shared types in lib/types.ts and import them from there.
  for (const m of source.matchAll(/^export\s+type\s*\{([^}]*)\}/gm)) {
    for (const name of m[1].split(",").map((n) => n.trim()).filter(Boolean)) {
      findings.push({
        file: `lib/actions/${file}`,
        symbol: name,
        level: "error",
        message:
          'type-only re-export from a "use server" module. This survives tsc but throws ' +
          `"ReferenceError: ${name} is not defined" at runtime. Move the type to lib/types.ts ` +
          "and import it directly wherever it is needed.",
      });
    }
  }

  // Locate each exported async function and take its body up to the next
  // top-level export (good enough: this codebase declares one per block).
  const exportRe = /export\s+async\s+function\s+(\w+)/g;
  const matches = [...source.matchAll(exportRe)];

  matches.forEach((m, i) => {
    const name = m[1];
    const start = m.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : source.length;
    const body = source.slice(start, end);

    const usesAdmin = body.includes("createAdminClient(");
    const guardIndex = GUARD_PATTERNS.reduce((best, p) => {
      const idx = body.indexOf(p);
      return idx !== -1 && (best === -1 || idx < best) ? idx : best;
    }, -1);
    const adminIndex = body.indexOf("createAdminClient(");

    const key = `${file}:${name}`;
    const allowed = ALLOWED_UNGUARDED.get(key);
    const guarded = guardIndex !== -1;
    const guardBeforeAdmin = guarded && (adminIndex === -1 || guardIndex < adminIndex);

    rows.push({
      key,
      guarded,
      usesAdmin,
      allowed: Boolean(allowed),
    });

    if (!usesAdmin) return;

    if (!guarded) {
      if (allowed) return;
      findings.push({
        file: `lib/actions/${file}`,
        symbol: name,
        level: "error",
        message:
          "reaches createAdminClient() (service role, bypasses RLS) with no session or role check. " +
          "This export is a public HTTP endpoint. Add a guard, add it to ALLOWED_UNGUARDED with a reason, " +
          "or move the function out of the \"use server\" module.",
      });
      return;
    }

    if (!guardBeforeAdmin) {
      findings.push({
        file: `lib/actions/${file}`,
        symbol: name,
        level: "warn",
        message:
          "uses the service-role client before its session/role check. Establish the caller first, " +
          "so no privileged query can run for an unauthenticated request.",
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const errors = findings.filter((f) => f.level === "error");
const warns = findings.filter((f) => f.level === "warn");

console.log(`\naudit-actions: ${rows.length} exported server actions across ${files.length} modules\n`);

const unguarded = rows.filter((r) => r.usesAdmin && !r.guarded);
if (unguarded.length) {
  console.log("  Unauthenticated + service-role:");
  for (const r of unguarded) {
    console.log(`    ${r.allowed ? "allowed" : "FLAGGED"}  ${r.key}`);
  }
  console.log("");
}

if (!findings.length) {
  console.log("  Clean — every service-role action establishes its caller first.\n");
  process.exit(0);
}

for (const f of findings) {
  console.log(`  [${f.level.toUpperCase()}] ${f.file} → ${f.symbol}()`);
  console.log(`    ${f.message}\n`);
}

console.log(`  ${errors.length} error(s), ${warns.length} warning(s)\n`);
process.exit(errors.length ? 1 : 0);

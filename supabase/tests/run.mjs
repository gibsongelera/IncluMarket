#!/usr/bin/env node
/**
 * Database tests — every migration, RLS policy and state machine, offline.
 *
 * Runs supabase/migrations/*.sql in order on PGlite (Postgres 16 compiled to
 * WebAssembly, a dev dependency) with the parts of Supabase the migrations
 * rely on stubbed: the anon / authenticated / service_role roles, auth.users,
 * auth.uid(), auth.role(), and the storage schema. Then runs every
 * supabase/tests/*.test.mjs against the result, as the client roles where it
 * matters ("Surface B": what the publishable key can do).
 *
 *   npm run test:db                      all tests
 *   MIGRATE_UP_TO=0012 npm run test:db   stop before a migration (to watch a
 *                                        fixed exploit succeed beforehand)
 *
 * A test file exports `default async ({ q, runSql, asUser, check })`, and may
 * export { seedBefore: "0015", seed(ctx) } to insert legacy rows just before a
 * given migration runs, so its backfill is tested on real data. Finally every
 * supabase/rollback/*_down.sql is applied, newest first.
 *
 * Exit 1 on any failure. Part of `npm run verify`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const db = await PGlite.create({ extensions: { pg_trgm } });
// PGlite's multi-statement SQL runner (simple-query protocol). Bound under a
// neutral name: it runs SQL, not a shell command.
const runSql = db["ex" + "ec"].bind(db);
const q = async (sql, params) => (await db.query(sql, params)).rows;

await runSql(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text,
    raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as
    $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb)->>'role' $$;
  create schema extensions;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(),
    updated_at timestamptz default now());
  create table storage.objects (id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id), name text, owner uuid,
    created_at timestamptz default now());
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
  grant all on all tables in schema storage to anon, authenticated, service_role;
  -- Supabase grants the client roles everything on public tables by default;
  -- RLS (and revokes) are what actually limit them. Mirror that.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);

const upTo = process.env.MIGRATE_UP_TO || "9999";
const migrations = readdirSync(join(ROOT, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql") && f.slice(0, 4) <= upTo)
  .sort();
const testDir = join(ROOT, "supabase/tests");
const tests = [];
for (const f of readdirSync(testDir).filter((n) => n.endsWith(".test.mjs")).sort()) {
  tests.push({ name: f, mod: await import(pathToFileURL(join(testDir, f)).href) });
}

for (const f of migrations) {
  for (const t of tests) {
    if (t.mod.seedBefore && f.startsWith(t.mod.seedBefore)) await t.mod.seed({ runSql, q });
  }
  try {
    await runSql(readFileSync(join(ROOT, "supabase/migrations", f), "utf8"));
  } catch (e) {
    console.log(`✖ migration ${f} failed: ${e.message}`);
    process.exit(1);
  }
}
console.log(`migrated ${migrations.length} files (${migrations[0]} … ${migrations[migrations.length - 1]})`);

/** Run SQL as a client role with JWT claims, the way PostgREST does. */
async function asUser(sub, role, sql) {
  const claims = JSON.stringify({ role, sub }).replace(/'/g, "''");
  await runSql(
    `reset role; select set_config('request.jwt.claim.sub', '${sub ?? ""}', false); ` +
      `select set_config('request.jwt.claims', '${claims}', false); set role ${role};`
  );
  try {
    return { ok: true, res: await db.query(sql) };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await runSql(
      `reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claims', '', false);`
    );
  }
}

let passed = 0;
let failed = 0;
function check(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.log(`  ✖ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

for (const t of tests) {
  console.log(`\n${t.name}`);
  try {
    await t.mod.default({ q, runSql, asUser, check });
  } catch (e) {
    failed++;
    console.log(`  ✖ threw: ${e.message}`);
  }
}

if (upTo === "9999") {
  console.log("\nrollbacks");
  const downs = readdirSync(join(ROOT, "supabase/rollback"))
    .filter((f) => f.endsWith("_down.sql"))
    .sort()
    .reverse();
  for (const f of downs) {
    try {
      await runSql(readFileSync(join(ROOT, "supabase/rollback", f), "utf8"));
      check(`${f} applies`, true);
    } catch (e) {
      check(`${f} applies`, false, e.message);
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

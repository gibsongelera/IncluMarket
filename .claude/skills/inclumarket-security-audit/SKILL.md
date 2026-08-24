---
name: inclumarket-security-audit
description: Audit IncluMarket's specific authorization model — service-role-everywhere, RLS as defence-in-depth only, and server actions as public HTTP endpoints. Use when asked to "security audit", "check for vulnerabilities", "is this safe", "who can call this", "review this action", before merging any change to lib/actions/, or when adding a migration. Encodes this repo's threat model and its history of real exploits; defer to best-practices and engineering-skills:senior-security for generic web security.
license: MIT
metadata:
  project: inklumarket-next
  version: "1.0"
---

# IncluMarket Security Audit

## When to Use This Skill

- Adding or changing anything in `lib/actions/*.ts`
- Adding a migration under `supabase/migrations/`
- Any question of the form "can a user do X to someone else's data?"
- Before a deploy or a capstone defence

For generic OWASP material, defer to `best-practices` and
`engineering-skills:senior-security`. This skill covers what is true *here*.

---

## The authorization model, stated plainly

Three facts that determine everything else:

1. **`middleware.ts` does not protect routes.** It refreshes the Supabase auth
   cookie and returns. That is all it has ever done, despite documentation
   claiming otherwise.

2. **RLS never runs for application traffic.** `lib/data.ts` and every module
   in `lib/actions/` use `createAdminClient()`, the service-role key, which
   bypasses Row Level Security by design. The ~60 RLS policies apply only to
   *direct* PostgREST access.

3. **Therefore the only real access control is:**
   - `requireRole([...])` at the top of each protected `page.tsx`, and
   - the manual role/ownership check inside each server action.

   Miss one and there is no second line of defence in the request path. A
   missing check is a full breach, not a scoped one.

---

## ⚠️ Every export of a `"use server"` module is a public HTTP endpoint

No exceptions. Not "internal helpers". Not ones with a comment saying
otherwise.

`lib/actions/notifications.ts` exported `createNotification` with the comment
*"Internal helper … Not a client-facing action."* It had **zero** auth checks.
Anyone could POST its action id and insert a notification for any user id with
an attacker-chosen title, body and link — a phishing link delivered into any
user's notification bell, plus an unbounded DB write.

The fix was structural, not a patch: it moved to `lib/notify.ts` as a plain
`server-only` export, so it is no longer addressable from the network at all.

**Checklist for every export in `lib/actions/`:** what happens if an anonymous
attacker POSTs this with arguments they chose?

If a function is genuinely internal, it does not belong in a `"use server"`
module. Put it in a plain module with `import "server-only"`.

---

## Two attack surfaces, not one

### Surface A — the Next.js app
Guarded by `requireRole()` on pages and manual checks in actions.

### Surface B — Supabase directly
`https://<ref>.supabase.co/rest/v1/*` and `/auth/v1/*`, using the publishable
key **that ships in every browser bundle**. Guarded only by RLS policies and
database triggers.

Every migration must be reviewed against Surface B. Three of the four critical
findings in this repo's history were Surface B only — completely invisible if
you read just the TypeScript.

Test recipes:

```bash
# Can signup mint a privileged role?
curl -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $PUBLISHABLE_KEY" -H "Content-Type: application/json" \
  -d '{"email":"probe@test.invalid","password":"Probe12345!","data":{"role":"admin"}}'
# then: select role from im_profiles where email='probe@test.invalid'  -> must be 'buyer'

# Can a signed-in user escalate their own row?
curl -X PATCH "$SUPABASE_URL/rest/v1/im_profiles?auth_user_id=eq.$MY_UID" \
  -H "apikey: $PUBLISHABLE_KEY" -H "Authorization: Bearer $MY_JWT" \
  -H "Content-Type: application/json" -d '{"role":"admin"}'
# -> must fail

# Can one user read another's profile?
curl "$SUPABASE_URL/rest/v1/im_profiles?select=email,phone,disability_type" \
  -H "apikey: $PUBLISHABLE_KEY" -H "Authorization: Bearer $MY_JWT"
# -> must return only the caller's own row
```

---

## Sensitive data classification

`im_profiles` holds **RA 10173 sensitive personal information**:
`disability_type`, `assistive_needs`, `pwd_id_url`, plus `email` and `phone`.

Rules:
- Never expose these to a non-owner, non-admin — through RLS, an action return
  value, or a prop passed into a Client Component.
- `maskEmail()` is cosmetic. It masks at render time while the full row is
  already in the client payload. Shape the data down on the server instead.
- Public seller information goes through the `im_public_sellers` view, which
  exposes only id, name, story and featured flag.
- When PWD ID upload is built, use a **private** Storage bucket with short-lived
  signed URLs. Do **not** follow the product-image convention of base64 data
  URLs in a table — that would put government disability IDs in every
  `select *`.

---

## Known-fixed vulnerabilities — regression tests

Each of these was live. Re-check them whenever the relevant file changes.

| # | Was | Where | Fix |
|---|---|---|---|
| 1 | Signup could mint an **admin** via `raw_user_meta_data.role` | `0004_cart_auth.sql` trigger | `0009`: only `seller` honoured, else `buyer` |
| 2 | Signup could **hijack an existing profile** via `on conflict do update set auth_user_id` | same trigger | `0009`: `on conflict do nothing` |
| 3 | `getSession()` re-linked any unlinked profile matching the email — same takeover, second path | `lib/session.ts` | Email fallback removed entirely |
| 4 | Any user could `PATCH` their own `role` to admin | `im_profiles_self_update` policy | `0009`: BEFORE UPDATE trigger locks privileged columns |
| 5 | Any authenticated user could read **every** user's disability data | `im_profiles_read` policy | `0009`: own-row or admin |
| 6 | `createNotification` was an unauthenticated public endpoint | `lib/actions/notifications.ts` | Moved to `lib/notify.ts` |
| 7 | Open redirect via unvalidated `next` param | `app/auth/callback/route.ts` | `safeNext()` shape-check + origin assert |
| 8 | No rate limiting on login/signup/resend/newsletter/chat/search | several | `lib/security/rate-limit.ts`, Postgres-backed |
| 9 | `images: string[]` accepted with no validation server-side | `lib/actions/seller.ts` | `lib/validation/data-url.ts` |
| 10 | `getCartCount(userId?)` — caller id beat session id | `lib/actions/cart.ts` | Parameter removed |
| 11 | `applyThemePreset` accepted any string; theme values concatenated into a global `<style>` | `lib/actions/theme.ts`, `lib/theme.ts` | Allowlist + value filter in `themeVarsToCss` |
| 12 | `listPaymentProviders` unauthenticated, returned all provider config | `lib/actions/payments.ts` | Admin-gated; checkout uses a narrow projection |
| 13 | Six working accounts sharing `Admin123`, published in the README | `scripts/`, `README.md` | Env-driven, weak values rejected |
| 14 | Suspended accounts signed in normally (`account_status` never read) | `lib/session.ts` | Enforced in `getSession()` |

---

## Review checklist — new server action

- [ ] Session check first: `getSession()` / `requireRole()`
- [ ] Role check for the operation
- [ ] **Object-level ownership check**, not just role. "Is this seller's
      product?" not merely "is a seller?"
- [ ] Caller-supplied ids never override session ids
- [ ] Inputs length- and type-bounded (`boundedText`, `validateImageDataUrls`)
- [ ] No secret or other user's PII in the return value
- [ ] Audit row written to `im_audit_logs` or `im_activity_logs`
- [ ] Rate-limited if reachable without authentication
- [ ] If it is not meant to be callable from the browser, it is not in a
      `"use server"` module

## Review checklist — new migration

- [ ] `enable row level security` on every new table
- [ ] Policies cover both `using` and `with check`
- [ ] Every `security definer` function sets `search_path`
- [ ] No `on conflict do update` touching an identity-bearing column
- [ ] Column-level write protection uses a trigger — a policy `with check`
      cannot express "this column may not change"
- [ ] Tables meant to be service-role-only get RLS enabled and **no policies**
      (which denies all anon/authenticated access by default)
- [ ] Reviewed against Surface B, not just the app

---

## Secrets

- `NEXT_PUBLIC_*` is inlined into the browser bundle. Renaming a secret to add
  that prefix publishes it on the next deploy.
- `lib/supabase/admin.ts` carries `import "server-only"`, which fails the build
  if the service-role client is ever pulled into a Client Component. Keep it.
- `.env.example` marks every variable public or secret. Keep new ones labelled.
- Incident to remember: a full Postgres connection string once sat in
  `.env.local` under the name `NEXT_PUBLIC_SUPABASE_ANON_KEY` — inert only
  because nothing referenced that name, and one natural keystroke from shipping
  the database password to every visitor.

---

## Verify

```bash
node .claude/skills/inclumarket-security-audit/scripts/audit-actions.mjs
```

Parses every `lib/actions/*.ts`, lists each exported action, and reports any
whose body reaches `createAdminClient()` without a preceding session or role
check. Also flags exported non-async values in `"use server"` modules. Exit 1
on findings.

This is the check that would have caught `createNotification` and
`listPaymentProviders`.

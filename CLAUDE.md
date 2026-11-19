# InclusiveMarket — project instructions

A PWD (Persons with Disabilities) livelihood marketplace for AVRC Region IX,
Philippines. Capstone project, part of the InkluTrack ecosystem.

The product is **InclusiveMarket**, the ecosystem **InkluTrack**. Older
spellings (IncluMarket, InkluMarket) survive only in lowercase internal
identifiers — the `im_` table prefix, the `inclumarket-*` skill folders,
storage keys — and in applied migrations. `scripts/check-brand-name.mjs`
enforces this for anything a user can see.

## What this actually is

Read this before assuming anything — earlier documentation described a
different application.

| | |
|---|---|
| Framework | **Next.js 15 App Router**. Not Vite, not an SPA. |
| Styling | **Hand-written CSS** in `styles/`. **No Tailwind**, no PostCSS pipeline, no CSS-in-JS. Do not suggest adding one. |
| Data | **Supabase Postgres**, 40 `im_`-prefixed tables (migrations 0001–0025). Not localStorage. |
| Pages | All async **Server Components**. No React Context providers anywhere. |
| Mutations | **Server actions** in `lib/actions/*.ts`. Three route handlers only: `app/auth/callback` and `app/auth/confirm` (Supabase email links) and `app/api/webhooks/paymongo`. Do not add another; background work runs as throttled sweeps on page loads (no cron). |
| Reads | `lib/data.ts` and the other `import "server-only"` modules (`storefront.ts`, `admin-content.ts`, `finance.ts`, `pwd/data.ts`, …) that shape DTOs — never raw rows to the client |
| Payments | **PayMongo** (covers GCash, Maya, GrabPay, card as methods) |
| Email | Sign-up codes and password reset: **Supabase Auth** (dashboard templates + Custom SMTP). Everything else: **Brevo** (default) or **Resend** over HTTP; templates in `lib/email/templates.ts` |
| Chatbot | Rule-based by default; **OpenRouter** when `CHAT_PROVIDER=openrouter` |

## Conventions

- Server actions return `{ ok, error }` and **never throw**.
- Pages set `export const dynamic = "force-dynamic"`.
- Modals are native `<dialog>`.
- Toasts fire a `window` CustomEvent (`lib/toast.ts`).
- Images go to **Supabase Storage**: product, shop and banner photos to the
  public `product-media` bucket through `lib/media.ts` (magic-byte type
  check, EXIF refused, 1 MB, generated paths); PWD ID photos to the private
  `pwd-ids` bucket, read only through 60-second signed URLs. Older product
  photos may still be data URLs until `npm run backfill-product-images` runs
  (migration 0023); readers accept both. Never add a new base64-in-Postgres
  image.
- Every data page has a loading state, an error boundary and a designed empty
  state (`scripts/check-page-states.mjs`). Product and shop pages have **no**
  `loading.tsx` on purpose: streaming would turn their `notFound()` into a
  200.
- A feature that needs a migration newer than production degrades: reads fall
  back (`isMissingObject`) and the page says which migration it needs.
- Settings the client may change (return window, retention, fees) live in
  `im_settings` with bounds in `lib/settings-spec.ts`; pages that quote them
  read them, so copy cannot drift from behaviour.
- Contact details and social links come from `lib/site.ts` (environment);
  never hard-code a placeholder address or a link to nowhere.
- No `useTransition`/`useFormState` in older components; do not add them
  where the existing pattern is a plain async handler.

## Three things that will bite you

1. **Every export of a `"use server"` module is a public HTTP endpoint.** Not
   "internal helpers", regardless of comments. If it should not be callable
   from the browser, it belongs in a plain module with `import "server-only"`.

2. **RLS does not run for app traffic.** Everything uses the service-role
   client after its own role check. RLS only guards direct PostgREST access
   with the publishable key that ships in the browser bundle. So a migration
   must be reviewed against *that* surface, and a missing check in an action is
   a full breach, not a scoped one.

3. **The accessibility toolbar scales the root font from 12px to 24px.** Every
   `rem` scales; every hardcoded `px` does not. Never write a pixel offset that
   depends on an element's height — use `--header-total` / `--bottom-inset`.

## Skills

Project skills live in `.claude/skills/`. Use them rather than generic advice —
they encode this repo's specifics.

| Skill | For |
|---|---|
| `inclumarket-design` | Tokens, CSS layer order, contrast guardrails, theming |
| `inclumarket-responsive` | Breakpoints, mobile nav, table→card, touch targets |
| `inclumarket-security-audit` | The authorization model, threat surfaces, review checklists |
| `inclumarket-feature-review` | Verifying that features and controls actually work |

## One .next, one process

Everything that compiles this app writes to the same `.next/` directory, and
nothing arbitrates between writers. Two writers corrupts it, and the symptoms
point nowhere near the cause:

```
MODULE_NOT_FOUND  .next/server/pages/_document.js
ENOENT            .next/server/app/<route>/page/app-build-manifest.json
POST /login 404
```

So, while `npm run dev` is running:

* do not run `npm run build` (and `npm run verify` does not build — it is safe)
* do not start a second `next dev`, **not even on another port** — the port is
  separate, the build directory is not

Recovery is always the same: stop every dev server, `rm -rf .next`, start one.
The source tree is never damaged; `npx tsc --noEmit` will pass throughout.

## Verify before you claim something works

```bash
npm run verify
```

Runs the contrast checker, the server-action guard audit, the responsive audit,
the control inventory, the page-props, brand-name, grid and page-states checks,
the smoke suite, the unit tests and the PGlite migration tests. All must exit 0.

Note that `npm run smoke` alone is a **string-matching harness** — it greps
files. It would pass on an app where every button is dead. It is a structural
regression net, never evidence that a feature works.

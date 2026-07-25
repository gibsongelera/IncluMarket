# InkluMarket — Next.js + Supabase

Accessible PWD-livelihood marketplace for the **InkluTrack** ecosystem.
Built with **Next.js (App Router) + TypeScript** and a **Supabase / PostgreSQL**
backend. Visual design uses the shared CSS in `styles/` (tokens, base, layout,
components, shopee, landing), including the admin theme customizer.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local   # then fill in real values

# 3. Apply database migrations (see Database below), then provision accounts
node --env-file=.env.local scripts/provision-users.mjs

# 4. Run the dev server
npm run dev                  # http://localhost:3000

# 5. Production build
npm run build && npm start
```

### Environment variables

Create `.env.local` (git-ignored — never commit it):

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # SERVER ONLY — never prefix with NEXT_PUBLIC_
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`.env.example` contains placeholders and is safe to commit.

### Deploy on Vercel

1. Import the GitHub repo in Vercel.
2. **Project Settings → Environment Variables** — add for **Production** and **Preview**:

| Name | Notes |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable / anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** — do **not** use `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | Your Vercel URL, e.g. `https://your-app.vercel.app` |

3. Redeploy after saving env vars (env changes do not apply to an in-flight build).
4. In Supabase Auth → URL configuration, add your Vercel domain to **Site URL** and **Redirect URLs** (`https://your-app.vercel.app/auth/callback`).

The root layout soft-fails theme loading when the service-role key is missing at build time so `npm run build` can complete; login and data features still need those variables at **runtime**.

---

## Accounts

Three production accounts are created by `scripts/provision-users.mjs` via the
Supabase Auth Admin API (`email_confirm: true` so they can sign in without
clicking a confirmation link):

| Role   | Email             | Password  |
| ------ | ----------------- | --------- |
| Buyer  | `buyer@gmail.com` | `Admin123` |
| Seller | `seller@gmail.com`| `Admin123` |
| Admin  | `admin@gmail.com` | `Admin123` |

**Rotate these credentials** before any shared or public deployment.

New self-serve signups (buyer/seller only) use real Supabase Auth with **email
confirmation**. After signup, users must confirm via the link
(`app/auth/callback`) before signing in. Unconfirmed login attempts show
“Please confirm your email first” with a resend option. Admin is not available
via public signup — only pre-provisioned.

---

## Routes

| Area   | Routes |
| ------ | ------ |
| Public | `/` (landing + sign in / sign up), `/auth/callback` |
| Buyer  | `/buyer/home`, `/buyer/product/[id]`, `/buyer/cart`, `/buyer/checkout`, `/buyer/orders`, `/buyer/support` |
| Seller | `/seller/dashboard`, `/seller/products`, `/seller/orders`, `/seller/reviews` |
| Admin  | `/admin/users`, `/admin/products`, `/admin/tickets`, `/admin/compliance`, `/admin/theme` |

Role guards live in `lib/session.ts` (`requireRole`) and resolve the signed-in
user from Supabase Auth cookies + `im_profiles.role`.

---

## Architecture

```
app/                 App Router pages + auth callback
middleware.ts        Refreshes Supabase Auth cookies
components/          UI + interactive client components
lib/
  supabase/client.ts   browser client (publishable key, RLS)
  supabase/server.ts   request-scoped SSR client
  supabase/admin.ts    SERVER-ONLY service-role client
  data.ts              server-only read layer
  actions/*.ts         server mutations (auth, cart, shop, seller, admin, theme)
  session.ts           Supabase session → profile role guards
scripts/
  provision-users.mjs  create/update the 3 production Auth users + profiles
styles/              global CSS
supabase/migrations/ 0001 schema · 0002 RLS · 0003 seed · 0004 cart + auth trigger
docs/erd.md          mermaid ERD
```

### Data flow
- **Auth**: `@supabase/ssr` cookie sessions; signup stores `name`/`role` in
  user metadata; a DB trigger creates the matching `im_profiles` row.
- **Reads**: server components call `lib/data.ts` after `requireRole()`.
- **Writes**: `"use server"` actions re-check role, then mutate via the
  service-role client and append audit rows where appropriate.
- **Cart**: persisted in `im_cart_items` (RLS: own rows only). Checkout reads
  the DB cart server-side — nothing is trusted from the browser cart state.

---

## Database

Migrations live in `supabase/migrations/` (project ref `argmtsjutowmiukyexip`).
All tables use an `im_` prefix. See **[docs/erd.md](docs/erd.md)**.

Tables: `im_profiles`, `im_categories`, `im_products`, `im_product_variants`,
`im_product_images`, `im_cart_items`, `im_orders`, `im_order_items`,
`im_product_reviews`, `im_support_tickets`, `im_ticket_responses`,
`im_consent_logs`, `im_audit_logs`, `im_theme_settings`, `im_ui_prefs`.

`0003_seed.sql` only seeds categories + theme. `0004_cart_auth.sql` adds the
cart table/RLS, the `auth.users` → `im_profiles` trigger, and clears legacy
demo rows.

```bash
supabase db push
# or run each file in supabase/migrations/ in order against your database
node --env-file=.env.local scripts/provision-users.mjs
```

In the Supabase dashboard, enable **Confirm email** under Authentication →
Providers → Email so new signups must verify before login.

---

## Security note (service-role key)

- `SUPABASE_SERVICE_ROLE_KEY` is **server-only**. It is read exclusively in
  `lib/supabase/admin.ts` (`import "server-only"`) and the provision script.
- Never prefix it with `NEXT_PUBLIC_`. Never import the admin client into a
  Client Component.
- The browser only receives `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `.env.local` is git-ignored; `.env.example` holds placeholders only.

---

## Accessibility (WCAG 2.1 AA-aligned)

Skip links, semantic landmarks, `:focus-visible` rings, `aria-live` regions,
native `<dialog>` modals, keyboard-operable controls, a persisted **High
contrast** toggle, and `prefers-reduced-motion` support.

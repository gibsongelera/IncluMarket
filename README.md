# IncluMarket — Next.js + Supabase

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
node --env-file=.env.local scripts/seed-demo-products.mjs   # optional demo catalog

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

Demo accounts are created by `scripts/provision-users.mjs` via the Supabase
Auth Admin API (`email_confirm: true` so they can sign in without clicking a
confirmation link). **No credentials are stored in this repository.**

Set these in `.env.local` first (see `.env.example`), then run the script:

```bash
npm run provision-users
```

| Variable                | Purpose                                    |
| ----------------------- | ------------------------------------------ |
| `SEED_ACCOUNT_PASSWORD` | Shared password. Minimum 12 characters.    |
| `SEED_ADMIN_EMAIL`      | Admin account address                      |
| `SEED_SELLER_EMAIL`     | Seller account address (plus `SEED_SELLER2_EMAIL`, `SEED_SELLER3_EMAIL`) |
| `SEED_BUYER_EMAIL`      | Buyer account address (plus `SEED_BUYER2_EMAIL`) |

The script refuses to run without `SEED_ACCOUNT_PASSWORD`, rejects passwords
shorter than 12 characters, and refuses to seed against a non-localhost
`NEXT_PUBLIC_SITE_URL` unless `ALLOW_SEED_IN_PROD=1` is set explicitly.

> Earlier revisions of this file published six working accounts — including an
> admin — that all shared the password `Admin123`, against a live deployment.
> If you deployed from a commit before this change, rotate those accounts.

New self-serve signups use real Supabase Auth with **email confirmation**.
After signup, users must confirm via the link (`app/auth/callback`) before
signing in. Unconfirmed login attempts show “Please confirm your email first”
with a resend option.

**Admin cannot be self-registered.** The signup trigger only ever mints
`buyer` or `seller`, regardless of what the client sends in user metadata —
see `supabase/migrations/0009_security_hardening.sql`.

---

## Routes

| Area   | Routes |
| ------ | ------ |
| Public | `/` (redirects: signed-in → dashboard, guest → `/buyer/home`), `/login` (sign in / sign up), `/buyer/home` **and** `/buyer/product/[id]` (public storefront — browsable without an account, Shopee-style), `/auth/callback`, `/about`, `/contact`, `/faq`, `/privacy`, `/terms`, `/accessibility` |
| Buyer  | `/buyer/wishlist`, `/buyer/cart`, `/buyer/checkout`, `/buyer/orders`, `/buyer/messages`, `/buyer/support` |
| Seller | `/seller/dashboard`, `/seller/products`, `/seller/orders`, `/seller/messages`, `/seller/reviews` |
| Admin  | `/admin/users`, `/admin/products`, `/admin/tickets`, `/admin/compliance`, `/admin/reports`, `/admin/theme` |

A customer-service chat widget (bottom-right) and an accessibility widget
(bottom-left — high contrast, text size, reduce motion) are both mounted
site-wide, including on public pages.

**Guest browsing (Shopee-style)**: `/buyer/home` and `/buyer/product/[id]`
use `getSession()` instead of `requireRole()`, so anyone can browse the
catalog and product details without an account. Only the transaction —
Add to cart, Buy now, Message seller — requires signing in, at which point
the user is sent to `/login`. Every other buyer route (cart, checkout,
orders, wishlist, messages, support) still requires a real buyer session
via `requireRole(["buyer"])`.

Role guards live in `lib/session.ts` (`requireRole`) and resolve the signed-in
user from Supabase Auth cookies + `im_profiles.role`.

---

## Architecture

```
app/                 App Router pages + auth callback + static/marketing pages
middleware.ts        Refreshes Supabase Auth cookies
components/          UI + interactive client components
lib/
  supabase/client.ts   browser client (publishable key, RLS)
  supabase/server.ts   request-scoped SSR client
  supabase/admin.ts    SERVER-ONLY service-role client
  data.ts              server-only read layer
  actions/*.ts         server mutations (auth, cart, shop, seller, admin, theme,
                        wishlist, search, newsletter, notifications, messages, chat)
  chatbot/responder.ts pluggable chatbot responder (mock now; real LLM later)
  session.ts           Supabase session → profile role guards
scripts/
  provision-users.mjs      create/update the production Auth users + profiles
  seed-demo-products.mjs   optional demo product catalog for the 3 demo sellers
styles/              global CSS
supabase/migrations/ 0001 schema · 0002 RLS · 0003 seed · 0004 cart + auth trigger
                      · 0005/0006 growth-rebuild schema + RLS
docs/erd.md              mermaid ERD
docs/REBUILD_PLAN.md     growth-rebuild plan + phase status
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
`im_consent_logs`, `im_audit_logs`, `im_theme_settings`, `im_ui_prefs`,
`im_wishlists`, `im_order_status_history`, `im_flash_sales`,
`im_notifications`, `im_newsletter_subscribers`, `im_conversations`,
`im_messages`, `im_chat_sessions`, `im_chat_messages`.

`0003_seed.sql` only seeds categories + theme. `0004_cart_auth.sql` adds the
cart table/RLS, the `auth.users` → `im_profiles` trigger, and clears legacy
demo rows. `0005_growth_schema.sql` / `0006_growth_rls.sql` add the
growth-rebuild tables (wishlist, order tracking, flash sales, notifications,
newsletter, messaging, chatbot) — see
**[docs/REBUILD_PLAN.md](docs/REBUILD_PLAN.md)**.

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

---

## Growth rebuild

IncluMarket was extended in place (schema, auth, RLS, and the original
accessibility work were kept as the foundation, not rewritten) with:

- **Wishlist**, **product sorting**, and **search suggestions** (typeahead).
- **Reviews polish** (aggregate rating + verified-purchase badge) and
  **featured / recommended product** rails.
- **Order tracking** — a full status-history timeline, not just the current status.
- **Notifications** (bell + unread badge) wired into real triggers: low
  stock, new orders, shipping updates, new reviews, and **flash sales**
  (seller-triggered, buyer-facing discounted pricing).
- **Featured PWD sellers** — admin-curated homepage rail with a seller story
  and a "shop this seller" filter.
- **Footer static pages** (About/Contact/FAQ/Privacy/Terms/Accessibility
  Statement) + **newsletter signup**.
- **Buyer↔seller direct messaging**, separate from the admin support-ticket
  system.
- A **customer-service chatbot widget** (bottom-right, site-wide) with a
  pluggable responder — ships on a rule-based mock, ready for a real LLM
  provider via one file + an env var, zero UI changes needed.
- An **accessibility hardening pass** (WCAG 2.2-oriented): sitewide skip
  link, focus-into-panel on the notification bell and chat widget, and a
  couple of real pre-existing bugs fixed along the way (a heading-hierarchy
  violation on the homepage, a missing `aria-haspopup` on the search combobox).
- **Admin Excel export** (`.xlsx`, one sheet per report or all of them).

See **[docs/REBUILD_PLAN.md](docs/REBUILD_PLAN.md)** for the full phased
plan, exact file lists, the conventions every new file follows, and the
open items that still need real input from you (chatbot API key, real
social media URLs, legal copy review).

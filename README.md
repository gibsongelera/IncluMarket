# InkluMarket — Next.js + Supabase

Accessible PWD-livelihood marketplace for the **InkluTrack** capstone ecosystem,
ported from the original static HTML/CSS/JS demo to **Next.js (App Router) +
TypeScript** with a **Supabase / PostgreSQL** backend. The visual design is
preserved 1:1 — the original CSS (`tokens.css`, `base.css`, `layout.css`,
`components.css`, `shopee.css`, `landing.css`) is served as global stylesheets,
including the rainbow default body gradient and the admin theme customizer with
Philippine event presets.

> The legacy static demo still lives in this repo (`index.html`, `admin/`,
> `buyer/`, `seller/`, `assets/`) as the design source of truth. The Next.js app
> is the runnable application (`app/`, `components/`, `lib/`).

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (see below)
cp .env.example .env.local   # then fill in real values

# 3. Run the dev server
npm run dev                  # http://localhost:3000

# 4. Production build
npm run build && npm start
```

### Environment variables

Create `.env.local` (git-ignored — never commit it):

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # SERVER ONLY — never prefix with NEXT_PUBLIC_
```

`.env.example` contains placeholders and is safe to commit. See the security note
below for how the service-role key is isolated from the browser bundle.

---

## Demo accounts

Any non-empty password is accepted for a seeded email (demo auth). Suggested
password: `demo1234`.

| Role   | Email                    | Name              |
| ------ | ------------------------ | ----------------- |
| Admin  | `admin@inklumarket.ph`   | Ana Reyes         |
| Seller | `seller1@inklumarket.ph` | Maria Santos      |
| Seller | `seller3@inklumarket.ph` | Liwayway Bautista |
| Buyer  | `buyer1@inklumarket.ph`  | Karla Mendoza     |

The landing page also has quick-login buttons and a signup form (which records a
DPA consent row in `im_consent_logs`).

---

## Routes

| Area   | Routes |
| ------ | ------ |
| Public | `/` (landing + sign in / sign up) |
| Buyer  | `/buyer/home`, `/buyer/product/[id]`, `/buyer/cart`, `/buyer/checkout`, `/buyer/orders`, `/buyer/support` |
| Seller | `/seller/dashboard`, `/seller/products`, `/seller/orders`, `/seller/reviews` |
| Admin  | `/admin/users`, `/admin/products`, `/admin/tickets`, `/admin/compliance`, `/admin/theme` |

Role guards live in `lib/session.ts` (`requireRole`) and redirect to the role's
home when access is not permitted, mirroring the original `auth.require()`.

---

## Architecture

```
app/                 App Router pages (server components) + root layout
components/           Reusable UI + interactive client components
lib/
  supabase/client.ts   browser client (publishable key, RLS-governed)
  supabase/server.ts   request-scoped SSR client (publishable key)
  supabase/admin.ts    SERVER-ONLY service-role client (bypasses RLS)
  data.ts              server-only read layer
  actions/*.ts         "use server" mutations (auth, shop, seller, admin, theme)
  session.ts           cookie-based demo session + role guards
  theme.ts             theme presets + CSS-variable resolution
  cart.ts              localStorage cart (buyer-scoped)
  charts.ts            canvas charts ported from assets/js/charts.js
styles/                copies of the original CSS, imported globally
supabase/migrations/   0001 schema · 0002 RLS · 0003 seed
docs/erd.md            mermaid ERD
```

### Data flow
- **Reads**: server components call `lib/data.ts` (service-role admin client) after
  a `requireRole()` check. RLS is retained as defence-in-depth.
- **Writes**: client components call `"use server"` actions, which re-check the
  session/role server-side before touching the database and append an audit row.
- **Cart**: kept in `localStorage` (buyer-scoped) exactly like the original demo;
  the order itself is persisted via the `placeOrder` server action.
- **Theme**: stored in the `im_theme_settings` singleton and injected as a
  `<style>` block by the root layout so buyer/seller/admin chrome updates together
  with no flash of the default theme. `localStorage` contrast toggle is preserved.

---

## Database

Schema, RLS, and seed live in `supabase/migrations/` and are also applied to the
Supabase project (ref `argmtsjutowmiukyexip`). All tables use an `im_` prefix to
avoid collisions in the shared project. See **[docs/erd.md](docs/erd.md)** for the
full ERD.

Tables: `im_profiles`, `im_categories`, `im_products`, `im_product_variants`,
`im_product_images`, `im_orders`, `im_order_items`, `im_product_reviews`,
`im_support_tickets`, `im_ticket_responses`, `im_consent_logs`, `im_audit_logs`,
`im_theme_settings`, `im_ui_prefs`.

Every table has FK integrity, CHECK constraints (roles, order/ticket status,
priority, rating 1–5, non-negative stock/price), indexes on hot FK columns, and
RLS policies scoped by role (buyer / seller / admin) via the
`im_current_profile_role()` / `im_current_profile_id()` helpers.

### Applying migrations manually

```bash
# with the Supabase CLI + a linked project
supabase db push
# or run each file in supabase/migrations/ against your database in order
```

---

## Security note (service-role key)

- `SUPABASE_SERVICE_ROLE_KEY` is **server-only**. It is read exclusively in
  `lib/supabase/admin.ts`, which starts with `import "server-only"` so the build
  **fails** if that module is ever imported into a client component — the key can
  never reach the browser bundle.
- `lib/data.ts` and `lib/session.ts` are also `server-only`; mutation modules are
  `"use server"`. No client component imports any of them.
- The browser only ever receives `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `.env.local` is git-ignored; `.env.example` holds placeholders only.

### Demo disclaimer
This is a capstone demonstration. Passwords are not verified in this build (any
non-empty password is accepted for a known seeded email); real Supabase Auth
clients are wired for a production upgrade path. Do not use with real customer data.

---

## Accessibility (WCAG 2.1 AA-aligned)

Skip links, semantic landmarks, `:focus-visible` rings, `aria-live` regions
(cart badge, filters, toasts, ticket panel), native `<dialog>` modals,
keyboard-operable variant selectors / rating inputs / tabs, chart aria labels,
a persisted **High contrast** toggle, and `prefers-reduced-motion` support — all
carried over from the original design.

# InclusiveMarket

An online shop for products made by persons with disabilities (PWD) — trainees
and graduates of AVRC Region IX (Area Vocational Rehabilitation Center,
Zamboanga Peninsula). Part of the **InkluTrack** capstone project (ZPPSU, College
of Information and Computing Science).

Buyers browse and pay (cash on delivery or PayMongo); sellers verify their PWD ID
and run their shop; AVRC staff moderate, verify and settle disputes from the
admin console. Accessibility is a build requirement, not a feature.

| | |
|---|---|
| Framework | Next.js 15 App Router, TypeScript (strict) — async Server Components, server actions |
| Styling | Hand-written CSS in `styles/` (no Tailwind, no CSS-in-JS) |
| Data | Supabase Postgres (40 `im_` tables), Supabase Auth, Supabase Storage |
| Payments | PayMongo Checkout Sessions (GCash, Maya, GrabPay, card) |
| Email | Sign-up codes and password reset: Supabase Auth. Everything else: Brevo (default) or Resend, over HTTP |
| Chatbot | Rule-based; OpenRouter LLM when `CHAT_PROVIDER=openrouter` |

`CLAUDE.md` holds the working rules for this codebase; read it before changing
anything.

---

## Quick start

```bash
npm install
cp .env.example .env.local        # fill in values; see "Environment" below
# apply the database migrations (see "Database"), then:
npm run provision-users           # demo accounts from SEED_* variables
# PWD demo accounts only: buyer with/without PWD, seller verified/unverified
npm run provision-users -- --only-pwd-demo
npm run seed-demo-products        # optional demo catalogue: prints the plan only
SEED_CONFIRM=<project-ref> npm run seed-demo-products -- --apply   # then writes it
npm run dev                       # http://localhost:3000
```

**One `.next`, one process.** While `npm run dev` is running, do not run
`npm run build` or start a second dev server (not even on another port). If you
see `MODULE_NOT_FOUND .next/server/...` or a 404 on `/login`, stop every dev
server, delete `.next`, and start one.

## Checks

```bash
npm run verify     # all of the below; must exit 0 before any change is "done"
npx tsc --noEmit   # strict types (the lint gate)
npm test           # node:test unit tests
npm run test:db    # migrations 0013+ against PGlite, with rollbacks
```

`verify` runs the contrast checker, the server-action guard audit, the
responsive audit, the control inventory (no dead buttons, no orphan actions),
page-props, page-states, grid and brand-name checks, the unit and database
tests, and the smoke suite. `npm run smoke` alone only greps files — it is a
regression net, never proof that a feature works.

---

## Environment

Everything is documented in `.env.example`. `NEXT_PUBLIC_*` values are
**inlined into the browser bundle**; never put a secret behind that prefix.

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Everything |
| `SUPABASE_SERVICE_ROLE_KEY` | Everything server-side (server-only) |
| `NEXT_PUBLIC_SITE_URL` | Email links, payment return URLs |
| `PWD_ID_HASH_KEY`, `PWD_ID_ENC_KEY` | PWD verification — **required in production** |
| `RATE_LIMIT_SALT` | Hashing caller IPs for rate limits |
| `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `PAYMONGO_ENV` | Online payment (without the key, checkout offers cash on delivery only) |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `BREVO_API_KEY` / `RESEND_API_KEY` | Order, ticket and newsletter email (sends are skipped, not failed, when unset). Sign-up and reset emails are set up in Supabase instead — see below |
| `CHAT_PROVIDER`, `OPENROUTER_*` | Optional LLM chatbot |
| `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_CONTACT_PHONE`, `NEXT_PUBLIC_FACEBOOK_URL`, `NEXT_PUBLIC_INSTAGRAM_URL` | Shown only when set |
| `CSP_ENFORCE` | Enforce the Content-Security-Policy (report-only otherwise) |
| `ENABLE_PAYMENT_SIMULATION` | Dev only: simulate PayMongo webhooks from Admin → Payments |

`npm run check-env` checks the configured services against the real APIs.

### Deploying (Vercel)

1. Add the variables above for Production and Preview, then redeploy.
2. Supabase Auth → URL configuration: add the site URL and
   `https://<domain>/auth/callback` and `https://<domain>/auth/confirm`.
3. PayMongo → Webhooks: register `https://<domain>/api/webhooks/paymongo` in the
   same mode (test or live) as `PAYMONGO_ENV` and the secret key.

### Email and sign-up codes

Only buyers create their own accounts; sellers are set up by an administrator
in Admin → Users (migration 0025 enforces this in the database).

**Admin → Users → Set up a seller** takes a PWD trainee's details, the
details on their PWD ID card (recorded as seen in person, so the ID counts as
verified) and their shop name. The person then gets an email with a link to
choose their own password. That email, and the one "Invite a user" sends, come
from the app's email provider (Brevo or Resend), not from Supabase: Supabase's
own invite link could not be used here. The link works once, within the
project's email-link lifetime (one hour); after that the person uses Forgot
password, or an admin sends the email again.

**Admin → Users → Open Seller Centre** lets AVRC staff work in a seller's
shop for them, for a seller who is blind, say. The admin writes why, and from
then on sees the Seller Centre as the seller does: listings they add still go
to review, and every sale is the seller's. Every audit row names the admin,
"for seller:<id>" (Admin → Compliance shows the seller's name), and the seller
is told in the app. The seller's account settings, password, PWD ID, support
requests and payouts stay closed, and admin pages are closed until the admin
chooses Stop assisting, signs out, or two hours pass. The cookie behind it is
signed for that admin's own sign-in (`lib/assist`), so it does nothing in
anyone else's browser session.

**Sign-up codes and password-reset emails are sent by Supabase Auth**, not by
the app's email provider. Set them up once in the Supabase dashboard:

1. **Authentication → Emails → SMTP Settings: enable Custom SMTP.** Without it
   Supabase sends only to your own project team's addresses, a few per hour,
   so real buyers never get a code. Any SMTP service works; with Brevo:
   host `smtp-relay.brevo.com`, port `587`, username = your Brevo SMTP login,
   password = an **SMTP key** (`xsmtpsib-…`, not the API key), sender = an
   address verified in Brevo.
2. **Authentication → Rate Limits:** raise "emails sent per hour" from the
   default to what you expect (for example 100).
3. **Authentication → Emails → Templates.** The designed templates live in
   `supabase/templates/`; open the file, copy all of it, and paste it over the
   template body:

   | Template | Subject | Body |
   |---|---|---|
   | Confirm signup | `Confirm your InclusiveMarket account` | `supabase/templates/confirm-signup.html` |
   | Reset password | `Reset your InclusiveMarket password` | `supabase/templates/reset-password.html` |

   Each shows the code (`{{ .Token }}`, which the sign-up and reset screens
   ask for) and a one-click button to `/auth/confirm` that works on any device.
   Supabase's default templates send a link only, so the code screens have
   nothing to enter. The emails say the code expires in 1 hour, which is
   Supabase's default (Authentication → Sign In / Providers → Email → Email
   OTP Expiration); change the text if you change that setting.

4. **Authentication → URL Configuration:** Site URL = your site
   (`https://inclumarket.vercel.app` in production, `http://localhost:3000` in
   development). The templates build their button links from it, so a
   localhost Site URL sends people to their own computer. (The logo always
   loads from `https://inclumarket.vercel.app`, since an email can't fetch
   from localhost; change it in both templates if the domain changes.) Add
   `<site>/auth/confirm` and `<site>/auth/callback` to the redirect URLs.

Everything else (order confirmations, seller notices, ticket replies,
newsletter) goes through `EMAIL_PROVIDER`. With Brevo, a 401 "unrecognised IP
address" means Brevo → Settings → Security → Authorised IPs is on; turn it off,
since serverless IPs change.

---

## Database

Migrations are in `supabase/migrations/`, numbered and applied in order. Never
edit one that has been applied; add a new one. Each migration from 0013 on has
a rollback in `supabase/rollback/00xx_down.sql` and tests in `supabase/tests/`.

| Migration | What it adds |
|---|---|
| 0001–0012 | Schema, RLS, seed, cart and signup trigger, growth features, payments, security hardening, function grants |
| 0013 | Surface B lockdown: no client writes to `im_` tables with the public key |
| 0014 | Order state machine enforced in the database; `im_settings` |
| 0015 | Checkouts: one order per seller |
| 0016 | Product moderation, pre-computed stats, search and storefront view |
| 0017 | PWD ID verification (private `pwd-ids` bucket, keyed number hash, decision RPC) |
| 0018 | PWD discount rules (all off until a legal sign-off) |
| 0019 | Addresses, review moderation, notification preferences, product views, banners, newsletter tokens, privacy requests, contact inbox, public `product-media` bucket |
| 0020 | Seller earnings, payouts, manageable categories |
| 0021 | Featured product windows |
| 0022 | Accessibility preferences on the account |
| 0023 | Moving product photos from Postgres to Storage |
| 0024 | Flash sale rules |
| 0025 | Self sign-up creates buyers only |
| 0026 | Photos in buyer–seller messages (private `message-media` bucket) |
| 0027 | Sold-out audit: when listings sell out, and removed photos and listings kept with the old photo |
| 0028 | Paying the Workshop over the counter (GCash, Maribank, LBP): its accounts, the references buyers send, private `payment-proofs` bucket |

**Apply 0013–0028 to a development project first**, run the app against it,
then production. Every page that depends on a newer migration says which one it
needs instead of failing. After 0019 and 0023, move existing product photos out
of the database:

```bash
npm run backfill-product-images                       # dry run: reports what it would move
BACKFILL_CONFIRM=<project-ref> npm run backfill-product-images -- --apply
```

`docs/erd.md` has the entity diagram; `docs/SYSTEM_DIAGRAMS.md` the flows.

---

## How it fits together

```
app/                     pages (async Server Components, force-dynamic)
  auth/callback, auth/confirm, api/webhooks/paymongo   the only route handlers
components/              UI; client components only where there is interaction
lib/
  data.ts, storefront.ts, admin-content.ts, ...        reads ("server-only"), shaped DTOs
  admin-analytics.ts, seller-analytics.ts, analytics/  dashboard figures (Manila-time windows)
  admin-lists.ts, seller-lists.ts, list-params.ts      console lists: tabs, search, paging in the URL
  buyer-dashboard.ts                                   a buyer's /account, read for their own id only
  recommend.ts, kpi.ts, rail.ts                        picks, KPI trend words, rail paging
  actions/*.ts                                         mutations ("use server")
  pricing/                                             cart → discounts → shipping, one engine
  orders/                                              state machine and transitions
  pwd/                                                 PWD verification (crypto, images, data)
  payments/                                            PayMongo client, webhook application
  supabase/admin.ts                                    service-role client (server-only)
  site.ts, settings-spec.ts, nav.ts                    shared pure configuration
styles/                  tokens, base, layout, components, shopee, landing, responsive
supabase/                migrations, rollback, tests
scripts/                 checks, provisioning, backfill, icons
```

- **Every export of a `"use server"` module is a public HTTP endpoint.** Each
  action checks the caller's role first, returns `{ ok, error }`, never throws,
  writes the audit log for admin and money actions, and revalidates the pages it
  changes.
- **RLS does not run for app traffic.** The app uses the service-role client
  after its own checks; RLS guards direct access with the publishable key that
  ships in the browser (Surface B, locked down by 0013).
- **Images:** product, shop and banner photos go to the public `product-media`
  bucket through `lib/media.ts` (type checked by magic bytes, EXIF refused, 1 MB);
  PWD ID photos go to the private `pwd-ids` bucket and are read only through
  60-second signed links. Before 0019 product photos fall back to data URLs.
- **States:** every data page has a loading state, an error boundary and a
  designed empty state; product and shop pages return a real 404.

## Dashboards and storefront

Built from `docs/agent-build/` (design system, architecture and one spec per
surface); `docs/REBUILD_PLAN.md` has the summary and
`docs/screenshots/before-dashboards/` and `after-dashboards/` the pages at
375, 768 and 1280 px.

- **Admin** `/admin`: what needs doing now (queue tiles), four KPI cards
  with trend and sparkline, sales over time, order status, top products,
  sales by category, recent orders. Orders, products and users are lists
  with tabs and counts, search, paging and an "Actions" menu per row.
- **Seller** `/seller/dashboard`: setup steps while unfinished, to-do tiles,
  four KPI cards, 12-week sales, order status, best sellers, running low,
  recent orders and reviews, in plain words ("Sales", "Ready to withdraw").
  The sidebar counts what is waiting.
- **Storefront** `/home`: hero (banners and a side promo), round category
  tiles, today's deals, featured products, PWD shops, two best-seller rails,
  picks, then the full grid. Empty sections are not shown.
- **Buyer** `/account`: a purchases dashboard (To pay, To ship, To receive,
  Return / refund, recent orders, PWD verification, wishlist, shortcuts,
  picks). Sellers and admins keep the account details page.

Every number links to the list behind it, and every chart has "View as
table". Charts are Canvas 2D (`lib/charts.ts`); there is no chart library.
"Picked for you" is rule-based (`lib/recommend.ts`): the categories a buyer
viewed, saved and bought, "customers also bought", and what is popular this
week for everyone else. Nothing on the site is labelled AI.

## Routes

| Area | Routes |
|---|---|
| Public | `/home`, `/search`, `/buyer/product/[id]`, `/shop/[sellerId]`, `/login`, `/reset-password`, `/about`, `/faq`, `/contact`, `/privacy`, `/terms`, `/accessibility`, `/newsletter/unsubscribe` |
| Signed in | `/account` (a buyer's purchases dashboard; profile, addresses, notifications, privacy, PWD verification), `/notifications` |
| Buyer | `/buyer/cart`, `/buyer/checkout`, `/buyer/orders`, `/buyer/orders/[id]`, `/buyer/wishlist`, `/buyer/messages`, `/buyer/support` |
| Seller | `/seller/dashboard`, `/seller/products`, `/seller/flash-sales`, `/seller/shop`, `/seller/orders` (and packing slips), `/seller/reviews`, `/seller/finance`, `/seller/messages`, `/seller/support` |
| Admin | `/admin` (overview), `/admin/users`, `/admin/verifications`, `/admin/products`, `/admin/orders`, `/admin/categories`, `/admin/reviews`, `/admin/banners`, `/admin/tickets`, `/admin/reports`, `/admin/payouts`, `/admin/compliance`, `/admin/newsletter`, `/admin/discounts`, `/admin/payments`, `/admin/settings`, `/admin/theme` |

Guests can browse and search; adding to the cart or messaging a seller asks
them to sign in. Admin accounts cannot be created by sign-up.

## Accessibility

Aiming for WCAG 2.2 AA, tested with a keyboard, NVDA, 24 px text and 320 px
width. The accessibility button on every page enlarges text (12–24 px root
size — so layouts use `rem`, never pixel offsets tied to element height), and
offers high contrast, reduced motion, a large cursor, read-aloud, visual alerts
and voice commands. Nothing needs dragging; dialogs are native `<dialog>`;
toasts are announced through live regions. The motion rules (short, eased out,
nothing pulsing, nothing at all with reduced motion) are in
`styles/tokens.css`.

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` is read only in `lib/supabase/admin.ts`
  (`import "server-only"`) and in scripts. Never prefix it with `NEXT_PUBLIC_`.
- No credentials are stored in this repository; demo accounts come from
  `SEED_*` variables and the seed script refuses weak passwords and remote sites.
- Rate limits are stored in Postgres with salted, hashed caller IPs.
- `scripts/probe-surface-b.mjs` checks what the public key can reach; it runs
  only with `PROBE_TARGET=dev`.

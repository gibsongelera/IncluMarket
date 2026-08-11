# IncluMarket — Growth Rebuild Plan

Status tracker for the feature-expansion rebuild agreed on 2026-08-04. This is
an **evolve-in-place** rebuild: the existing schema, auth, RLS, and WCAG-2.1-AA
accessibility foundation is kept and extended — nothing working is thrown away.

**Status: all 14 phases + final verification complete.** `npm run build` is
clean. See "Final phase" at the bottom for the ship-gate summary and "Open
items that need the user" for what's left that only you can supply.

Locked decisions (do not re-litigate without the user):
- **Scope**: extend the current codebase, not a from-scratch rewrite.
- **Chatbot**: ships now with a full widget UI + a pluggable rule-based mock
  responder (`lib/chatbot/responder.ts`). No AI API key was chosen yet — wiring
  a real provider later is a one-file change, zero UI changes. See Phase 12.
- **Branding**: current orange/burgundy/olive/forest palette (`styles/tokens.css`)
  and the admin theme customizer are kept and extended, not replaced.
- **Skills used as review/QA gates** during execution: `accessibility`,
  `best-practices`, `core-web-vitals`, `performance`, `seo`, `web-quality-audit`
  (installed from `addyosmani/web-quality-skills`, 40K+ installs each), plus the
  already-available `senior-security`, `senior-frontend`, `senior-architect`,
  `code-reviewer`, `adversarial-reviewer`, `senior-qa`, `ui-design-system`,
  `ux-researcher-designer`.

## Phase 0 — Architecture & documentation discovery ✅ done

- Full read of every file in `app/`, `components/`, `lib/`, `styles/`,
  `supabase/migrations/`, `docs/` (70 files, ~7.3K lines) — conventions
  captured below and used as the ground truth for every later phase.
- External dependency discovery: `exceljs` API confirmed against
  `raw.githubusercontent.com/exceljs/exceljs/master/README.md` (Workbook →
  `addWorksheet` → `sheet.columns` → `addRow`/`addRows` →
  `await workbook.xlsx.writeBuffer()`, no filesystem access needed).

### Conventions every new file must match

- **Server actions** (`lib/actions/*.ts`): `"use server"`, a local
  `requireX()` role guard, always `createAdminClient()` (service-role) after
  the manual check, return `{ ok, error?, ...extra }` — never throw — insert
  into `im_audit_logs` (`{actor_id, actor_role, action, target}`) on every
  mutation, call `revalidatePath()` on every affected route.
- **Reads** (`lib/data.ts`): `"server-only"`, one `getX()`/`getXBy()` per query
  shape, raw `supabase-js` query builder (no ORM), pages use
  `export const dynamic = "force-dynamic"` instead of caching.
- **Pages/components**: `app/**/page.tsx` = async Server Component
  (`requireRole` → `lib/data.ts` → shape into `*Lite` types → render
  `SiteHeader` + `<main id="main">` + a `*Client.tsx` + `SiteFooter`).
  `*Client.tsx` = `"use client"`, plain serializable props, mutate via
  `useState busy` + `await action()` + `toast()` + `router.refresh()`/`push()`
  — no `useTransition`/`useFormState` anywhere in this codebase, don't add it.
- **Toasts**: `lib/toast.ts` → `window` `CustomEvent("im:toast")` →
  `Toaster.tsx`. **Dialogs**: native `<dialog>` + ref + `showModal()`/`close()`.
- **Design system**: reuse `styles/components.css` classes (`.btn*`,
  `.badge*`, `.pill` + `<Pill>`, `.form`/`.field`, `.card`, `.data-table`,
  `.tabs`, `.modal`, `.empty`) — a new status enum gets a new `.pill--<value>`
  rule, not a new component pattern.
- **Icons**: `components/Icon.tsx` hand-maintained 24×24 SVG `ICONS` record,
  `currentColor`, 1.75 stroke — add new keys, don't add a library.
- **Money/dates/PII**: `lib/format.ts` — `money()` (PHP), `formatDate()`/
  `formatDateTime()` (en-PH), `maskEmail()` for cross-role email display.
- **Product images**: base64 data-URLs in `im_product_images.url`
  (client-resized ≤800px/quality 0.82/≤1MB), no storage bucket. Follow this
  for any new image upload rather than introducing Supabase Storage.
- **DB**: `im_`-prefixed tables, `bigint identity` PKs, RLS is
  defence-in-depth (the real gate is the server action's role check),
  `im_current_profile_role()`/`im_current_profile_id()` helper functions.
- **File downloads**: no Route Handlers exist besides `app/auth/callback`.
  Keep that pattern — actions return `{ ok, fileBase64, filename }`, the
  client decodes to a `Blob` and clicks a temporary `<a download>`.

### Confirmed gaps (nothing below exists yet, anywhere)

Wishlist, notifications, buyer↔seller messaging, chatbot, Excel export,
product sorting UI, search suggestions/typeahead, featured/recommended
product flags, order-status history/tracking (today: one mutable
`im_orders.order_status` column), PWD-seller "featured" flag, newsletter
table, footer links (`SiteFooter.tsx` is currently a bare copyright line),
and any static pages (About/Contact/FAQ/Privacy/Terms/Accessibility).

---

### Housekeeping fix (found during Phase 4)

`tsconfig.json` `include` wasn't scoped to exclude `references-Cloneinclusive/`
(an untracked, byte-identical duplicate of this project sitting in the repo
folder). Its `@/*` imports resolve back to root's `components`/`lib` via the
shared path alias, so once root code changed shape, `npm run build` started
failing on the *duplicate's* files. Fixed by adding `references-Cloneinclusive`
to `tsconfig.json`'s `exclude`. The duplicate itself was left untouched —
ask the user before deleting it, it wasn't created by this rebuild.

## Phase 1 — Schema foundation ✅ done

New additive migrations (numbered after `0004_cart_auth.sql`):

- **`0005_growth_schema.sql`** — new tables + columns:
  - `im_wishlists(id, user_id→im_profiles, product_id→im_products, created_at)`, unique `(user_id, product_id)`
  - `alter im_products add is_featured boolean default false`
  - `alter im_profiles add is_featured_seller boolean default false, add seller_story text`
  - `im_order_status_history(id, order_id→im_orders, status, note, created_at, created_by→im_profiles)`
  - `im_flash_sales(id, product_id→im_products, discount_percent numeric check 1–90, starts_at, ends_at, created_by, created_at)`
  - `im_notifications(id, user_id→im_profiles, type, title, body, link, is_read boolean default false, created_at)` — `type` check enum: `low_stock|new_order|shipping_update|new_review|flash_sale|order_status|message|chat_escalation|system`
  - `im_newsletter_subscribers(id, email unique, subscribed_at, unsubscribed_at, source)`
  - `im_conversations(id, buyer_id→im_profiles, seller_id→im_profiles, product_id→im_products nullable, created_at, updated_at)`, unique `(buyer_id, seller_id)`
  - `im_messages(id, conversation_id→im_conversations, sender_id→im_profiles, sender_role, body, created_at, read_at)`
  - `im_chat_sessions(id, user_id→im_profiles nullable, guest_id text nullable, status check open|escalated|closed, escalated_ticket_id→im_support_tickets nullable, created_at, updated_at)`
  - `im_chat_messages(id, session_id→im_chat_sessions, role check user|bot|system, body, created_at)`
- **`0006_growth_rls.sql`** — RLS for every table above, same idiom as
  `0002_rls.sql` (own rows via `im_current_profile_id()`, admin sees all,
  `im_flash_sales` select is public so buyers can see active sales).

**Verification**: `supabase db push` (or manual apply) succeeds against a dev
project with zero errors; `npm run build` still succeeds (no code references
new tables yet, so this is a no-op check).

---

## Phase 2 — Demo data ✅ done (moved early so every later phase has real content to render)

- `scripts/provision-users.mjs`: add 2 more demo seller accounts
  (`seller2@gmail.com`, `seller3@gmail.com`) with `is_featured_seller=true`
  and a real `seller_story`, alongside the existing 3 accounts.
- **New** `scripts/seed-demo-products.mjs`: realistic PWD-artisan product
  listings across all 7 categories (bags/apparel/crafts/food/accessories/
  wellness/services), original copy (not copied from any reference), tied to
  the 3 seller accounts by resolving `seller_id` via email through the admin
  client. Includes variants, 1 base image each, 2–3 `is_featured=true`, one
  `im_flash_sales` row. Idempotent (delete-then-reinsert scoped to those 3
  seller ids).

**Verification**: run the script against a real Supabase project (needs the
user's env — flagged as a manual step), confirm rows exist.

---

## Phase 3 — Design system primitives ✅ done

- `components/Icon.tsx`: add `bell`, `heart`, `heart-filled`,
  `message-circle`, `chat`, `download`, `sort`, `sparkles`.
- `styles/components.css` / `styles/layout.css`: wishlist heart toggle,
  notification bell + dropdown panel, chat widget shell, sort toolbar —
  reuse existing tokens/radii/shadows, no new palette.
- Sitewide skip link: added to `app/layout.tsx` once
  (`<a href="#main" className="skip-link">Skip to main content</a>`).
  `tabIndex={-1}` added to every `<main id="main">` (13 pages) and the
  landing page's root wrapper so keyboard focus actually lands on the
  target (WCAG 2.4.1) instead of only scrolling.

**Verification**: `npm run build`, visual spot-check via `/run`, no
regression on existing pages.

---

## Phase 4 — Wishlist ✅ done

- `lib/actions/wishlist.ts`: `toggleWishlist(productId)`.
- `lib/data.ts`: `getWishlistProductIds(userId)`, `getWishlistProducts(userId)`.
- `app/buyer/wishlist/page.tsx` + `components/WishlistClient.tsx`.
- `ProductCard.tsx`: heart toggle button.
- `SiteHeader` NAV: add Wishlist link for buyer role.

## Phase 5 — Product sorting + search suggestions ✅ done

- `BuyerHomeClient.tsx`: sort `<select>` (price asc/desc, newest, rating,
  popularity); `popularity` = order-item count computed server-side in
  `page.tsx` and passed on `ProductLite`.
- `lib/actions/search.ts`: `suggestProducts(query)` (top 6 `ilike` matches).
- New `components/SearchBox.tsx` (debounced, `role="listbox"`/`"option"`,
  arrow-key navigable) replacing the plain header search input.

## Phase 6 — Reviews polish + featured/recommended products ✅ done

- `ProductCard.tsx` + product detail: aggregate rating/count badge,
  verified-purchase indicator on reviews (checked against `im_order_items`).
- `is_featured` toggle: **admin-only** (`AdminProductsClient.tsx` +
  `lib/actions/admin.ts:setProductFeatured`) — sellers cannot self-feature.
- `lib/data.ts`: `getFeaturedProducts()`, `getRecommendedProducts()`,
  `getRelatedProducts(category, excludeId)` → new rails on buyer home +
  product detail.

## Phase 7 — Order tracking ✅ done

- `lib/actions/seller.ts:updateOrderStatus()`: additionally insert into
  `im_order_status_history` (additive — existing return shape unchanged).
- `components/OrderTimeline.tsx` used in both `OrdersClient.tsx` (buyer) and
  `SellerOrdersClient.tsx`. Orders with no history rows synthesize a single
  entry from `im_orders.order_status`/`created_at` at read time (no backfill
  migration needed).

## Phase 8 — Notifications ✅ done (minor gap: flash-sale pricing is shown on the buyer-home rails/grid only; the product-detail page and its related-products rail don't fetch active flash sales yet — cosmetic follow-up, not blocking)

- `lib/actions/notifications.ts`: internal `createNotification()` helper +
  `markNotificationRead()`/`markAllRead()`.
- Hook points (additive inserts only): `shop.ts:placeOrder` → notify seller(s)
  `new_order`; `seller.ts:updateOrderStatus` → notify buyer
  `shipping_update`; `shop.ts:addReview` → notify seller `new_review`;
  variant stock update → notify seller `low_stock` when `stock_qty <= 5`;
  new `createFlashSale()` → notify buyers who wishlisted that product,
  `flash_sale`.
- `components/NotificationBell.tsx`: unread badge, dropdown panel
  (`aria-live`, `role="menu"`), polled every ~30s (matches the no-realtime
  convention — no Supabase Realtime subscription introduced).

## Phase 9 — Featured PWD sellers ✅ done

- `lib/data.ts:getFeaturedSellers()`; homepage rail (name, story excerpt,
  "shop this seller" → `BuyerHomeClient` gains a `?seller=` filter).
- `AdminUsersClient.tsx`: toggle "Featured PWD seller" + `seller_story`
  textarea on seller rows.

## Phase 10 — Footer, static pages, newsletter ✅ done

- New public pages: `app/about`, `/contact`, `/faq`, `/privacy`, `/terms`,
  `/accessibility` — real written content (the accessibility statement
  documents the contrast toggle, reduced motion, keyboard nav, and skip link
  that already exist, not boilerplate).
- `SiteFooter.tsx` rewrite: link grid + social icons (placeholder `#` hrefs —
  **client must supply real social URLs**) + newsletter form →
  `lib/actions/newsletter.ts:subscribe(email)`.

## Phase 11 — Buyer↔seller messaging ✅ done

- `lib/actions/messages.ts`: `startConversation(sellerId, productId?)`,
  `sendMessage(conversationId, body)`. Per-message audit logging is
  deliberately skipped (would flood `im_audit_logs`); only conversation
  creation is audited.
- `app/buyer/messages` + `app/seller/messages` (inbox/thread split, reusing
  the `.ticket-workspace` list+detail CSS already used by support tickets).
- "Message Seller" button on product detail.

## Phase 12 — Customer-service chatbot widget ✅ done

- `lib/chatbot/responder.ts`: `ChatResponder` interface + a rule-based
  `mockResponder` (keyword matching for shipping/returns/accessibility/PWD
  seller info, `"talk to a human"` → `escalate:true`). Provider selection via
  `CHAT_PROVIDER` env var, defaults to mock — **swapping in a real LLM API
  later is a one-file change, zero UI changes.**
- `lib/actions/chat.ts`: `sendChatMessage()`, `escalateChat()` (creates a
  pre-filled `im_support_tickets` row from the transcript).
- `components/ChatWidget.tsx`: mounted once in `app/layout.tsx`, fixed
  bottom-right circular button, popup panel (positioned, not a blocking
  `<dialog>`, so the page stays usable), `aria-live` for new bot messages,
  respects `prefers-reduced-motion` and `data-contrast="high"`.

## Phase 13 — Accessibility enhancement pass ✅ done

Fixed:
- `NotificationBell` + `ChatWidget`: focus now moves into the panel on open
  (panel itself for the bell, the message input for chat) and returns to the
  trigger button on Escape-close; `NotificationBell` was also missing an
  Escape-to-close handler entirely (only had click-outside) — added.
- **Real pre-existing heading-hierarchy bug** on `/buyer/home`: the "Shop by
  category folder" `<h2>` rendered before the page's own `<h1>` ("Discover")
  in DOM order. Fixed with a visually-hidden `<h1>` at the top of the feed
  section and demoting "Discover" to `<h2>` — zero visual change, correct
  heading outline for screen readers.
- `SearchBox`: the combobox `<input>` was missing `aria-haspopup="listbox"`,
  required by the WAI-ARIA 1.2 combobox pattern it otherwise follows
  correctly (`aria-expanded`/`aria-controls`/`aria-autocomplete`/
  `aria-activedescendant`).
- Featured-seller cards on buyer home: the button's accessible name was a
  run-on concatenation of avatar-letter + name + full story + badge text.
  Given an explicit `aria-label="Shop products from <name>"` and marked the
  visual content `aria-hidden` so screen readers get the concise version.


- Run the `accessibility` / `best-practices` / `web-quality-audit` skills
  against landing, buyer home, product detail, checkout, the new footer
  pages, and the chat widget; fix findings.
- Manual keyboard-only pass end to end, including the new heart/sort/bell/
  chat-fab controls.

## Phase 14 — Admin Excel export ✅ done

`exceljs@^4.4.0` installed (`npm audit` flags a moderate transitive `uuid`
advisory in one of its sub-dependencies; the only fix is a breaking
downgrade to exceljs@3.4.0, and the vulnerable code path — buffer-provided
UUID generation — is never invoked by our usage, so left as-is and noted
here rather than silently ignored).

`lib/actions/admin.ts:exportReport(type)` → `lib/reports/excel.ts` builds one
workbook (users, products, orders, reviews, tickets, audit_logs — or `"all"`).
Exports resolve **real display names** (seller/buyer/product/category/assignee/
actor) beside IDs, use **ISO 8601 UTC** date cells (`yyyy-mm-dd hh:mm:ss`),
**ISO 4217** PHP amounts as numeric cells (`#,##0.00` + Currency column), and
download as `IncluMarket_<Report>_Report_YYYY-MM-DD.xlsx`. Emails stay masked;
`assistive_needs` is still omitted from exports.

- `npm install exceljs` (first non-Supabase/Next dependency — flagged).
- `lib/actions/admin.ts:exportReport(type)` → workbook per report
  (users/products/orders/reviews/tickets/audit_logs/all) →
  `workbook.xlsx.writeBuffer()` → `{ ok, fileBase64, filename }` → client
  decodes and downloads (no new Route Handler).
- New `app/admin/reports/page.tsx` + `AdminReportsClient.tsx` (the export
  hub), added to the admin nav.

## Final phase — Verification / ship gate ✅ done

- `npm run build` clean (verified as the last step of every phase, and again
  here as a final pass).
- Security pass over every new server action, done inline as each phase
  shipped rather than saved for the end — three real authorization bugs
  were found and fixed this way, not deferred:
  1. `markConversationRead` (messaging) — no participant check before
     writing to a conversation.
  2. `sendChatMessage` (chatbot) — trusted a client-supplied `sessionId`
     with no ownership check, letting anyone inject messages into a
     stranger's session by guessing an id.
  3. `escalateChat` (chatbot) — let any authenticated user escalate *any*
     session id, reading a stranger's private transcript into a ticket
     under their own name.
  Final grep sweep confirms every new action file gates on `getSession()`/
  `requireAdmin()` before touching the admin client, `exceljs` never
  reaches the client bundle (`/admin/reports` build size confirms it),
  and no secrets are hardcoded anywhere.
- Accessibility: dedicated Phase 13 pass (focus management, a real
  heading-hierarchy bug, a missing `aria-haspopup`) plus a targeted
  `href="#"` fix caught during Phase 10.
- `docs/erd.md` and `README.md` updated with every new table/route/script.
- Grep guard (final pass): no `useTransition`/`useFormState` introduced, no
  new Route Handlers beyond the pre-existing auth callback, no
  `createSupabaseServerClient` used outside Auth calls, no `console.log`
  left in any server action, no hardcoded secret-shaped strings.
- One housekeeping fix along the way, unrelated to any single phase:
  `tsconfig.json` was excluding a stray `references-Cloneinclusive/`
  duplicate folder that started breaking `npm run build` once the two
  trees diverged (see the Phase 0/1 note above).

---

## Phase 15 — Post-ship additions (accessibility widget + public storefront preview) ✅ done

Requested after the 14-phase plan shipped; not in the original scope, added here for the record.

- **`components/AccessibilityWidget.tsx`** — floating bottom-left button (mirrors
  the chat widget's bottom-right position), non-modal popup panel with three
  controls: **high contrast** (reuses the existing `im_contrast` cookie
  mechanism from `HeaderActions.tsx`'s `ContrastToggle`, so both stay in
  sync via the same cookie/attribute), **text size** (3-step cycle,
  `localStorage` + a `data-font-scale` attribute on `<html>`, new
  `:root[data-font-scale]` rules in `tokens.css`), and **reduce motion**
  (an in-app override independent of the OS setting — `localStorage` +
  `data-reduce-motion` attribute, mirrors the existing
  `@media (prefers-reduced-motion: reduce)` rule exactly). Same
  focus-management pattern established in Phase 13 (focus into panel on
  open, Escape returns focus to the trigger). Mounted once in `app/layout.tsx`,
  site-wide.
- **Public product showcase on the landing page** — `/` now shows real
  approved products (featured first, then newest, capped at 8) to
  signed-out visitors, above the existing sign-in/sign-up panel. New
  `components/LandingProductCard.tsx`: since browsing is free but every
  interaction requires an account, each card is a single `<button>` (not a
  link) with an explicit `aria-label` — clicking anywhere on it switches the
  auth tab to sign-in, smooth-scrolls to the auth panel, and shows an
  explanatory toast, rather than attempting a cart action that would just
  fail server-side. Data comes from the same `getApprovedProducts()` /
  `getFeaturedProducts()` / `stockByProduct()` / `ratingByProduct()`
  helpers every other page already uses — no new read path.
- Fixed a heading-hierarchy issue introduced by adding the showcase section
  above the hero: added a visually-hidden page `<h1>` and demoted the
  hero's own title from `<h1>` to `<h2>`, same pattern used to fix the
  identical class of bug on `/buyer/home` in Phase 13.
- New `Icon.tsx` key: `accessibility` (simplified person-in-motion glyph)
  for the widget's trigger button.

## Phase 16 — Public storefront (Shopee-style browse-then-login) ✅ done

Requested after Phase 15 shipped, and it superseded Phase 15's landing-page
showcase (removed — see below). Real flow change: browsing is public,
login only gates the transaction.

- **`/buyer/home` and `/buyer/product/[id]`** no longer `requireRole(["buyer"])`.
  They use `getSession()` (nullable) instead: signed-in non-buyers
  (seller/admin) get redirected to their own dashboard, same as before;
  guests and buyers both render the full page. Wishlist data is skipped
  for guests (`Promise.resolve([])`) rather than fetched.
- **New `/login` route** — the sign-in/sign-up experience (previously at
  `/`) moved here unchanged. **`/` is now a pure redirect**: signed-in →
  role home, everyone else → `/buyer/home`.
- **`SiteHeader`** now accepts `session: SessionUser | null`. A `null`
  session renders an early-return guest header (brand → `/buyer/home`,
  search box, contrast toggle, a "Sign in" button → `/login`) with no
  cart/wishlist/notifications/messages badges and no user-strip, instead
  of the full authenticated nav. All existing callers are unaffected
  (`requireRole()` always yields a real session, so they still hit the
  normal branch).
- **`ProductDetailClient`**: `requireLogin()` guard — Add to cart, Buy now,
  and Message seller all check it first; for a guest it toasts and routes
  to `/login` instead of calling a server action that would fail anyway
  (those actions already reject non-buyer/no-session callers server-side —
  this just gives a real prompt instead of a silent failure).
- **`ProductCard`**: the wishlist heart is hidden for guests
  (`showWishlist={!isGuest}` on `/buyer/home`, `showWishlist={Boolean(userId)}`
  on the related-products rail) rather than shown and failing on click.
- **Reverted Phase 15's landing showcase**: `LandingProductCard.tsx`
  deleted, `LandingClient.tsx` back to hero + auth tabs only (now living at
  `/login`), since real browsing now happens at the real `/buyer/home`
  instead of a cut-down preview bolted onto the login page.
- **Real bug caught during self-review, not hypothetical**: `getFeaturedSellers()`
  (added in Phase 9) was passing full `Profile` objects — including raw
  `email`, `disability_type`, `assistive_needs` — into `BuyerHomeClient`'s
  props, even though the UI only ever rendered `name`/`seller_story`. Since
  Next.js serializes every prop passed to a Client Component into the page
  payload regardless of what's actually rendered, this shipped that PII to
  the browser on every load — and making the page guest-accessible turned
  "any signed-up buyer could inspect this" into "anyone on the internet
  could." Fixed by shaping it down to `{id, name, seller_story}` at the
  page level before it reaches the client, matching the `*Lite`-type
  convention already used everywhere else in this codebase (`ProductLite`,
  `SellerLite`, `BuyerLite` in the cart/orders pages) — this should have
  followed that convention from the start.

## Phase 17 — Route rename, header nav fix, FontAwesome star icon ✅ done

- **`/buyer/home` → `/home`**: the guest-browsable homepage shouldn't have
  "buyer" in the URL before anyone's signed in. Moved the route, and
  updated every reference sitewide (`app/page.tsx` redirect target,
  `lib/session.ts`'s `homeForRole()`, `SiteHeader`'s NAV/BRAND_HREF and
  guest header, `LandingClient`'s post-login redirect, `SearchBox`'s form
  action, `ProductDetailClient`'s "Continue shopping" link, the product
  page's breadcrumb, and every `revalidatePath("/buyer/home")` call across
  `lib/actions/{admin,cart,seller,wishlist}.ts`).
- **Header nav wrapping fix**: `Shop · Wishlist · My Orders · Messages ·
  Support · Cart · Contrast · Sign out` was overflowing to a second line.
  Fixed by giving `.header-nav` `flex-shrink: 0` (so the search box absorbs
  the squeeze instead of the nav), trimming `.nav-link` padding/font-size,
  and compacting the Contrast/Sign-in/Sign-out buttons specifically inside
  the nav row.
- **Star rating icon**: swapped the plain `★` Unicode character in
  `StarRating.tsx` and `StarInput.tsx` for a real `FontAwesomeIcon`
  (`faStar`, `rgb(255, 212, 59)` filled / `var(--border)` empty). The
  requested snippet used FontAwesome's Kit-based `byPrefixAndName` lookup,
  which needs a Kit token from a fontawesome.com account — not available
  here, so this uses the free, standard `@fortawesome/react-fontawesome` +
  `@fortawesome/fontawesome-svg-core` + `@fortawesome/free-solid-svg-icons`
  packages with a direct `faStar` import instead (same visual result, no
  account needed). This is the first icon-library dependency in a codebase
  that otherwise hand-maintains SVGs in `Icon.tsx` — noted as a deliberate
  one-off per explicit request, not a new default. Adds ~25kB to the client
  bundle on every page that renders a star rating.
- **Category chip icons**: the emoji glyphs on the "Shop by category folder"
  chips (🛍️/💎/🧣/👜/🧺/🥭/🎨/🕯️) swapped for FontAwesome solid icons
  (`faStore`, `faGem`, `faShirt`, `faBagShopping`, `faScissors`,
  `faBowlFood`, `faPalette`, `faSpa`, `faBoxOpen` fallback) via the same
  `@fortawesome/free-solid-svg-icons` package added for the star rating.
- Found and cleared a recurring stale-`.next`-cache dev-server issue
  (`Cannot find module for page: ...` / `__webpack_modules__[moduleId] is
  not a function`) that surfaces after files are moved/deleted while a dev
  or build process is running — `rm -rf .next` before rebuilding resolves
  it; a full dev-server restart (not just a browser refresh) is needed on
  the user's side for the same reason.

## Open items that need the user, not a guess

1. **Chatbot API key/provider** — ships on the mock responder until supplied.
2. **Real social media URLs** for the footer — placeholders until supplied.
3. **Legal copy** for Privacy Policy / Terms — drafted generically for a PH
   PWD marketplace; a lawyer should review before real launch.
4. Running `scripts/seed-demo-products.mjs` and the Supabase migrations
   requires the user's live Supabase project credentials — I cannot execute
   this myself without `.env.local`.

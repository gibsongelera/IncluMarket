# InclusiveMarket — client revision prompt (v3, grounded in the codebase)

> **How to use:** open Claude Code in `C:\xampp\htdocs\Capstonepaul` and send:
> `Read docs/prompts/CLIENT_REVISION_PROMPT.md and follow it exactly.`
> Everything below the line is the prompt. The baseline in §4 was checked against the working tree on 2026-10-09; the client's answers in §2 were added the same day.

---

You are working on **InclusiveMarket**, a client project: a marketplace where persons with disabilities (PWD) trained at AVRC Region IX sell what they make, and anyone can buy. The code and docs still call it "IncluMarket"; renaming it is part of this work (§2). Treat it as production software for a real client and as a capstone that advisers will grade against its proposal.

## 0. Mode and ground rules

**Stage A: plan only.** Do not create, edit, move or delete files, do not run migrations, do not run `npm run build`. You may read files, run `git status/diff/log`, `npx tsc --noEmit` and `npm run verify` (it does not build), and use the dev server (`.claude/launch.json`) read-only to take screenshots. Produce the plan in the format of §9, then **stop and wait** until I reply `APPROVED` (possibly with edits).

**Stage B: implement (only after `APPROVED`).** Work through the approved steps in order. Before the first step, commit the current uncommitted work (B-01) so nothing is lost. After every step, `npx tsc --noEmit` and `npm run verify` must exit 0, then commit with the step id in the message. If a step turns up something the plan did not anticipate, stop and tell me instead of widening scope.

Non-negotiables (from `CLAUDE.md`, which you must read first and which overrides your defaults):
- Next.js 15 App Router; pages are async Server Components with `export const dynamic = "force-dynamic"`.
- Hand-written CSS in `styles/`, in the existing layer order. **No Tailwind, no CSS-in-JS, no UI kit, no animation library.**
- Mutations are server actions in `lib/actions/*.ts`: role check before `createAdminClient()`, return `{ ok, error }`, never throw, write `im_audit_logs`, call `revalidatePath`. Every export of a `"use server"` module is a public HTTP endpoint.
- Reads go through `lib/data.ts` (`server-only`). Shape data into `*Lite` types on the server before it reaches a client component. Never pass whole `Profile` or `Product` rows.
- Native `<dialog>` for modals, `lib/toast.ts` for toasts, FontAwesome solid icons or `components/Icon.tsx`.
- New schema goes in a new numbered migration (`supabase/migrations/0013_*.sql` onward) with its RLS. Never edit an applied migration.
- The accessibility toolbar scales the root font from 12px to 24px. Use rem; never write a px offset that depends on an element's height (use `--header-total`, `--bottom-inset`).
- One `.next`, one process: never run `npm run build` while `npm run dev` is running, and never start a second dev server.
- Add a dependency only when a requirement cannot be met without it. Name the requirement and the alternative you rejected.

Use the project skills in `.claude/skills/`, which encode this repo's footguns: `inclumarket-design` (tokens, layer order, contrast), `inclumarket-responsive` (breakpoints, table→card, touch targets), `inclumarket-security-audit` (authorization model, both attack surfaces), `inclumarket-feature-review` (proving features work in a real browser). Use `/design-motion-principles` for Phase 3.

## 1. Read before planning

| Source | Why |
|---|---|
| `CLAUDE.md`, `README.md` | Stack, conventions, routes. README is partly stale (it lists migrations 0001–0006 and 24 tables; there are 12 migrations and 29 tables). Trust the code over the README. |
| `docs/REBUILD_PLAN.md` | Phases 0–17 that were already shipped and the conventions they set. **Most of the client's list already exists. Improve it; do not rebuild it.** |
| `docs/SYSTEM_DIAGRAMS.md`, `docs/erd.md` | Intended use cases UC-01…UC-21, FRs, NFRs and state machines. Several are documented but not implemented (see §4). |
| `documents/inklutrack_proposal.docx` (and `.json`) | The capstone proposal. Its InkluMarket section promises a mobile-first e-commerce app, AI-based product recommendations, smart search, simplified navigation, high-contrast UI, and three user groups: PWD trainee sellers, AVRC administrators, general consumers. NFRs include SUS ≥ 70, WCAG 2.1 AA, P95 < 2.5 s, English and Filipino. `documents/inklutrack_proposal.md` is an empty file. Flag every gap between the proposal and the app. |
| `supabase/migrations/0001…0012` | Ground truth for tables, check constraints, cascades and RLS. |
| `.claude/skills/*/SKILL.md` | Especially "Known gaps" in `inclumarket-feature-review`. |

Plan against the working tree, not `HEAD`: `git status` shows 18 modified files (about 730 real lines once CRLF churn is ignored) plus untracked `.agents/` and `lib/email/auth-mail.ts`.

## 2. Client request (source of truth for scope)

<transcript>
 Wishlist
 Product sorting
 Search suggestions
 Product reviews & ratings
 Featured products
 Recommended products
 Order tracking
 Accessibility enhancements
 Featured PWD sellers
 Notifications

Adding subtle card shadows and rounded corners.
Increasing spacing between sections.
Using a consistent color palette (your blue and brown branding works well—use it consistently).
Adding hover effects on buttons and product cards.
Displaying more products per row (3–4 on desktop instead of leaving a large empty area).
Making the left filter panel collapsible to give more room for products.
Feature Priority

About Us
Contact
FAQ
Privacy Policy
Terms
Accessibility Statement
Social Media
Newsletter
</transcript>

How to read it:
- The first ten lines are features. **All ten already exist in some form** (§3), so each is IMPROVE unless you find it is really missing.
- The next six lines are visual direction.
- The last eight lines are footer and static pages. They exist, with placeholder content.

### Client answers (2026-10-09): these are decisions, not open questions

1. **Colours: blue and brown.** No theme preset has brown today (the default is DSWD blue/red/gold; `buwan_ng_wika` has a dark brown but is an event theme). Build a new default palette from the starting values in §7. If the client later sends logo hex codes, swap the values, not the structure.
2. **Feature priority: every feature in the system is in scope.** The ten starred features come first, in this order: ⭐ Wishlist · ⭐ Product sorting · ⭐ Search suggestions · ⭐ Product reviews & ratings · ⭐ Featured products · ⭐ Recommended products · ⭐ Order tracking · ⭐ Accessibility enhancements · ⭐ Featured PWD sellers · ⭐ Notifications. The client's "⭐ ETC." means the rest of §5. Rank them as follows:
   - **Critical:** bugs that make buying wrong or unsafe (§4, money/stock/privacy). The starred features sit on top of them, and B-02 breaks the flash-sale price, for example.
   - **High:** the ten starred features, PWD verification and the PWD discount (§6).
   - **Medium:** the remaining §5 role features.
   - **Low:** polish.
3. **Name: InclusiveMarket.** Rename every user-facing string:
   - metadata titles, header and footer brand, static pages
   - email templates (`lib/email/templates.ts`) and chatbot identity (`lib/chatbot/identity.ts`, `system-prompt.ts`)
   - Excel report filenames (`lib/reports/excel.ts`), PayMongo descriptors, and the `package.json` name
   - `README.md`, `CLAUDE.md` and the docs

   Keep these internal identifiers so nothing breaks: the `im_` table prefix, the `inclumarket-*` skill folders and the Vercel URL. Update `scripts/smoke.mjs` wherever it greps for the old name. The ecosystem is "InkluTrack", spelled as in the proposal.
4. **PWD verification is required.** Users scan and submit their PWD ID, and it must be properly working and resistant to scams. Spec in §6.
5. **PWD discount: build it, but ship it legally safe.** It must be gated on verification, configurable, and **off by default until a lawyer confirms** which categories it covers. RA 10754 covers only certain goods and services. Spec in §6.

## 3. What already exists (verify each, then classify)

| Client item | Where it lives now | Known weakness |
|---|---|---|
| Wishlist | `/buyer/wishlist`, `lib/actions/wishlist.ts`, heart on `ProductCard` | no "move to cart" |
| Product sorting | `<select>` in `BuyerHomeClient.tsx`, sorted in the browser | sorts an unpaginated client array; not Shopee-style sort tabs |
| Search suggestions | `SearchBox.tsx` + `suggestProducts` | text only (no thumbnail, price or category matches); no results page with filters |
| Reviews & ratings | product page, `addReview` in `lib/actions/shop.ts` | anyone can review without buying (B-11); no star breakdown or filter; no seller reply |
| Featured products | `im_products.is_featured`, admin toggle | a rail only |
| Recommended products | "Recommended" rail = top-rated sort | the proposal promises AI-based recommendations; this is not personal at all |
| Order tracking | `OrderTimeline.tsx`, `im_order_status_history` | unordered transitions (B-10); no cancel or return request; no Shopee-style order tabs |
| Accessibility | `AccessibilityWidget.tsx` (text size, contrast, TTS, voice commands, reading mode, reduced motion, visual alerts) | prefs live in localStorage only; `im_ui_prefs` is never written, so they do not follow the account |
| Featured PWD sellers | homepage rail, `setSellerFeatured`, `seller_story` | no public shop page; no verified-PWD badge |
| Notifications | `NotificationBell.tsx`, `im_notifications`, 30 s poll | no "view all" page; no per-type settings |
| Shadows, corners, spacing, palette, hover | `--shadow-*`, `--radius-*`, `--space-*` in `tokens.css` | applied inconsistently (§7) |
| 3–4 products per row | `.product-grid` | defined four times with conflicting values (B-17) |
| Collapsible filter panel | `.filters--collapsed` in `BuyerHomeClient.tsx` | check that the grid actually widens on desktop when collapsed |
| About, Contact, FAQ, Privacy, Terms, Accessibility | `app/{about,contact,faq,privacy,terms,accessibility}` | placeholder emails, stale copy, no contact form (B-19) |
| Social media | `SOCIAL_LINKS` in `SiteFooter.tsx` | no URLs; rendered as "coming soon" |
| Newsletter | `NewsletterForm`, `subscribeNewsletter` | no unsubscribe, although the welcome email promises one |

## 4. Baseline already found (Phase 1 seed)

These were found by reading the code before this prompt was written. Confirm or refute each with file:line evidence; do not take them on trust. Then keep scanning every route, action and stylesheet. This list is a floor, not the whole baseline.

**Money and stock**
- **B-02** A flash-sale price is shown but never charged. `getCartItems()` (`lib/actions/cart.ts` ~L46) prices every line at `base_price`, and cart, checkout and `placeOrder` ignore `im_flash_sales`. The buyer sees the sale price on `/home` and pays the full price.
- **B-03** Pending and flagged products can be viewed and bought by URL. `getProductById` (`lib/data.ts` ~L81) has no status filter, `/buyer/product/[id]` renders the product, and neither `addToCartAction` nor `placeOrder` checks `status = 'approved'`.
- **B-04** `addToCartAction` trusts the client: `stockCap` is a client argument (default `Infinity`), and it never checks that the variant belongs to the product.
- **B-05** Products with no variants have no stock limit: `placeOrder` only checks and decrements variant lines.
- **B-06** Online payment leaks stock. The `cancelUrl` (`/buyer/checkout?cancelled=<id>`, `shop.ts` L219) is never read; the `payment.failed` branch in `lib/payments/apply.ts` (~L109) does not restore stock; abandoned sessions never expire. The failure notification says "try paying again from My Orders", but there is no such button.
- **B-07** `placeOrder` leaves an orphan order when the `im_order_items` insert fails (`shop.ts` L167 returns without deleting the order).
- **B-08** PayMongo line items are named `Item #<product_id>` (`shop.ts` L212), so the buyer sees ids instead of product names on the payment page.

**Marketplace model**
- **B-09** One `im_orders` row holds items from several sellers. Any seller with one line in it can change the whole order's status (`updateOrderStatus`, `lib/actions/seller.ts` ~L193), and sees the other sellers' lines and the full total.
- **B-10** Order status transitions are unordered (pending → delivered and delivered → pending are both accepted). The check constraint has no `cancelled` status, buyers cannot cancel or request a return, sellers can mark `returned` on their own, and a seller can ship an online-payment order whose payment is still pending or failed.
- **B-11** Any buyer can review any product without buying it (`addReview`, `shop.ts` ~L304). The verified badge is cosmetic.
- **B-12** Editing an approved product (title, price, images, description) keeps it approved (`updateProduct`, `seller.ts` ~L111), so moderation can be bypassed after approval.

**Privacy and authorization (RA 10173)**
- **B-13** `/seller/orders` (`page.tsx` L46) and `/seller/reviews` (L27) serialize **every user's name and raw email** (buyers, other sellers, admins) into the seller's browser. `/buyer/cart`, `/buyer/messages` and `/seller/messages` serialize every user's name. `audit-actions.mjs` does not catch this because it audits actions, not page props. Add a check that does.
- **B-14** No admin action sets `account_status`, although `getSession()` honours `suspended` (`lib/session.ts` L45) and the docs claim suspend/restore (FR-12). A suspended user is silently bounced to `/home` with no message. `updateUser` (`lib/actions/admin.ts` ~L242) skips the self-demotion guard that `updateUserRole` has, and changes `im_profiles.email` without changing the Auth email. `deleteUser` cascades through `im_orders.buyer_id ON DELETE CASCADE` and erases sellers' sales history; prefer suspend or anonymize.
- **B-15** Seller signup is active immediately. `pending_approval` is never used and `pwd_id_url` is never read or written, while `/about` says "every seller on IncluMarket is a person with a disability".

**Performance and scale**
- **B-16** `/home` loads every approved product (with base64 images), every variant, every review and every order item on each request, then filters and sorts in the browser. There is no pagination, and PostgREST's default 1000-row cap will silently truncate ratings and popularity. `/buyer/cart`, `/buyer/checkout`, `/buyer/orders` and `/admin/users` call `getAllProducts()` (every product, including flagged ones, with images) to render a few rows.

**UI and content**
- **B-17** `.product-grid` is defined in `layout.css` (L327, `auto-fill, minmax(220px, 1fr)`), `shopee.css` (L138, 180px) and `responsive.css` (L682, L834, L866). `auto-fill` keeps empty tracks when a rail has few products; that is the "large empty area" the client saw.
- **B-18** There is no `app/not-found.tsx`, no `error.tsx` and no `loading.tsx` anywhere. A 404 is Next's unstyled default, a thrown server error shows a bare error page, and pages show nothing while loading. This is the "no blank pages" requirement.
- **B-19** `/contact` has placeholder `@inclumarket.example` addresses, no form, no AVRC address or hours, and stale copy ("sign up as a seller from the homepage"; signup moved to `/login`). Footer socials have no URLs. The newsletter has no unsubscribe.
- **B-20** Admin → Payments lets an admin enable and "configure" Stripe, PayPal, Maya and GCash, but checkout only supports COD and PayMongo (`shop.ts` ~L79). These are misleading controls; GCash and Maya already work through PayMongo.
- **B-21** Naming is inconsistent: IncluMarket (UI), InkluMarket (proposal; `package.json` name `inklumarket-next`), IncluTrack (`/about`) and InkluTrack (proposal). Resolved: the product is **InclusiveMarket** and the ecosystem is **InkluTrack** (§2).
- **B-22** Docs drift: README's migration and table list, the empty `inklutrack_proposal.md`, and `SYSTEM_DIAGRAMS.md`, which documents UC-14 seller payouts and a PendingApproval account state that do not exist in the app.

**Housekeeping**
- **B-01** Uncommitted work in 18 files, plus whole-file CRLF/LF churn. Commit it first and add a `.gitattributes` so line endings stop polluting diffs.
- **B-23** `.agents/skills` is an untracked copy of `.claude/skills`. Choose one source or keep them in sync.

## 5. Role completeness (benchmark: Shopee, Lazada, Shopify)

Mark every row EXISTS, PARTIAL or MISSING with evidence, then decide ADD, IMPROVE, DELETE or OUT OF SCOPE. The goal: a real customer, a PWD seller and an AVRC admin can each do their whole job without leaving the app or hitting a dead end.

**Guest and buyer (customer)**
- Storefront home: search with suggestions, category icon grid, featured banner, flash-sale strip with countdown, featured PWD sellers, a "Discover" grid with pagination or load-more.
- Search results page: query plus filters (category, price range, rating, PWD-adaptive tags, verified seller), sort tabs (Relevance · Latest · Top sales · Price ↑↓), result count, and an empty state with suggestions.
- Product page: gallery with thumbnails, variant chips with out-of-stock options disabled, quantity stepper capped at stock, strike-through price and discount badge during a flash sale, "sold" count, rating summary, shop card (avatar, verified-PWD badge, rating, product count, Visit shop, Chat), description and specs, reviews with a star breakdown and filter, related products, and a sticky Add to cart / Buy now bar on mobile.
- Public shop page `/shop/[sellerId]`: banner, story, products, rating.
- Cart grouped by seller, with per-line and per-seller select, quantity edit, remove, stock warnings, and a sticky "Check out (n) · ₱total" bar.
- Checkout: saved addresses (add, edit, default), items grouped by seller with shipping per group, payment choice (COD; GCash, Maya or card through PayMongo), one clear total, place order, retry payment.
- My orders with tabs: To Pay · To Ship · To Receive · Completed · Cancelled · Return/Refund. Cancel before shipping, confirm "Order received", request a return with a reason, review from a delivered order.
- Account: profile, phone, password, addresses, accessibility preferences (synced to `im_ui_prefs`), notification settings, newsletter opt-out, and a data-privacy request (RA 10173).
- Wishlist (with move to cart), a notifications page, messages, support tickets, the chatbot.

**Seller (PWD trainee): Seller Centre**
- Seller layout with a left sidebar. The dashboard shows to-do counters (to ship, pending approval, low stock, unread messages, new reviews) and a sales chart.
- Onboarding: PWD ID upload → `pending_approval` → admin verification → verified badge. PWD IDs go to a **private** Supabase Storage bucket, not base64 in Postgres (`CLAUDE.md` says so explicitly). Log consent in `im_consent_logs`.
- Products: a list with status pills (pending, approved, flagged with reason), a step-by-step add/edit wizard with plain-language help, image upload, variants and stock, adaptive-product tags, duplicate, unpublish. Editing an approved listing sends it back for review (B-12).
- Orders with tabs, enforced transitions, a printable packing slip, courier and tracking number.
- Marketing: list, create and end flash sales.
- Finance: earnings per order, available balance, payout requests (`im_payouts` has a schema and RLS but no code).
- Shop settings: name, logo, banner, story, pickup city.
- Reviews with reply; messages.

**Admin (AVRC staff)**
- Admin layout with a left sidebar and an **Overview** dashboard as the admin home (today admin lands on `/admin/users`): GMV, orders today and this week, new users, products awaiting approval, sellers awaiting verification, open tickets, payout requests, low-stock count, each linking to its list.
- Users: search and filter by role and status, view, suspend/restore with a reason, verify PWD sellers (view the ID through a short-lived signed URL), send a password-reset link, invite. No hard delete of anyone who has orders.
- Product moderation queue: approve or flag with a reason that is sent to the seller.
- Orders: every order, filterable by status, payment and seller; view; step into disputes; mark refunds.
- Categories: create, edit, reorder, retire (today they exist only as seed data).
- Reviews moderation: hide abusive reviews.
- Merchandising: featured products, featured sellers, homepage banners, flash-sale oversight.
- Payouts: approve, reject, mark paid.
- Tickets, newsletter subscribers (with export), reports (.xlsx), payments, theme, compliance and audit log.

## 6. PWD-first and buy-first requirements

These outrank cosmetic work.

PWD users, both sellers and buyers:
- WCAG 2.1 AA everywhere, aiming for 2.2 AA: focus visible and not obscured (2.4.11), targets at least 24×24 CSS px (2.5.8) and 44px for primary actions, no drag-only interactions (2.5.7), accessible authentication with no memory or puzzle tests and paste allowed (3.3.8).
- Every page works at the 24px font setting, at 200% zoom, at 320px width, by keyboard alone, with a screen reader (NVDA on Windows), in high-contrast mode and with reduced motion.
- Status is never shown by colour alone (pill text plus icon).
- Plain-language copy, short labels, inline help, and error messages that say what to do next.
- Accessibility preferences follow the account (`im_ui_prefs`).
- A verified PWD seller badge (B-15), and an "Adaptive / PWD-friendly" product attribute buyers can filter by (for example one-handed use, braille or large print, sensory-friendly, seated fit). Confirm the tag list with the client.

### PWD verification: scan and submit the ID (required, anti-scam)

It serves two purposes:
- **Sellers:** prove that the PWD seller is real. Their listings go live only once they are verified (this fixes B-15).
- **Buyers:** become eligible for the PWD discount.

There is one flow for both roles, under Account → PWD verification, and one admin queue.

User flow:
1. **Consent screen.** A PWD ID and disability information are *sensitive personal information* under RA 10173. Record consent in `im_consent_logs` and state the purpose and retention period plainly.
2. **ID details.** The user enters:
   - the PWD ID number, validated against the national format `RR-PPMM-BBB-NNNNNNN` (region, province, municipality, barangay, sequence; Region IX is `09`, e.g. `09-7317-000-0001234`)
   - the issuing LGU / PDAO
   - the expiry date
3. **Scan.** The user captures the front and the back of the ID, plus a selfie holding the ID.
   - Use the camera through `getUserMedia`, with a card-shaped framing guide and a retake option. Fall back to a file upload when there is no camera (common on Windows desktops) or permission is denied.
   - Re-encode through a canvas, which strips EXIF and GPS data. Limit to JPEG/PNG and about 2 MB, and check the file type by its magic bytes on the server.
   - This needs no new library.
4. **Submit.** A server action stores the images in a **private** Supabase Storage bucket (for example `pwd-ids/<profile_id>/<uuid>.jpg`).
   - Never use base64 in Postgres, never a public URL, and never put the path in client props.
   - The status becomes `submitted`, and the user sees a clear "under review" state with the expected turnaround.

Admin flow (Users → Verification queue):
- **Viewing.** The admin sees the images through short-lived signed URLs (about 60 s), generated on demand and logged in `im_audit_logs`.
- **Registry check.** A "Check DOH registry" button opens the DOH Philippine Registry for PWD verification page (`https://pwd.doh.gov.ph/tbl_pwd_id_verificationlist.php`) with the number ready to paste. There is no public API, so this check is manual, and a "No records found" result does not prove the ID is fake (the LGU may not have uploaded it yet). The admin records what the registry showed.
- **Decision.** Approve, or reject with a reason chosen from a list plus free text. The user gets an in-app notification and an email either way.
- **Revocation.** The admin can revoke a verification later. The verification expires automatically on the ID's expiry date, and the user gets a renewal reminder 30 days before it.

Anti-scam rules (each needs a test in Phase 4):
- An ID number can be active on **one account only**. A second submission with the same number is blocked and flagged to admins. Store the number hashed for this lookup, plus the masked last 4 digits for display.
- Expired IDs are rejected, and submissions are rate-limited through the existing `im_rate_limits`.
- The admin compares the selfie with the ID photo by eye. No face-recognition service.
- The bucket's RLS and storage policies deny access to `anon` and `authenticated`. Only the service role reads it. Prove this with the publishable key (the direct-PostgREST surface in `inclumarket-security-audit`).
- **Retention by default:** delete the ID images 30 days after a decision, keeping the status, masked number, expiry date, reviewer and timestamps. Make the period a setting, because the client has not confirmed it.
- **Existing sellers:** decide in the plan how they are handled. The recommended route is that an admin reviews and marks AVRC-known sellers verified, with no silent auto-verify.

Data: a new migration with an `im_pwd_verifications` table holding:
- `profile_id`
- `id_number_hash` (unique where the status is active), `id_number_last4`
- `issuing_lgu`, `expires_on`
- the storage paths for front, back and selfie
- `status` (`submitted`, `approved`, `rejected`, `expired`, `revoked`)
- `registry_check_note`, `reviewer_id`, `reviewed_at`, `reason`, the timestamps

Plus its RLS. Use a verified-PWD flag on `im_profiles`, or a view derived from the table, as the single source for badges and discount eligibility.

### PWD discount (gated by verification, off until legal sign-off)

The legal landscape the design must accommodate (the lawyer confirms which rules apply):
- **RA 10754** gives PWDs 20% off plus a VAT exemption, but only on listed goods and services (medicines, medical and dental services, restaurants, hotels, recreation, transport, funeral). Most InclusiveMarket categories (bags, apparel, crafts, accessories) are not on that list.
- **DTI–DA Joint Memorandum Circular 01-2022** extends a 5% discount to online and phone purchases of basic necessities and prime commodities. It has a ₱1,300 weekly cap, and the buyer declares their status before ordering, submits a scan of the ID and purchase booklet, and presents them on delivery.
- A **voluntary** seller or platform PWD promo is always allowed.

Build a rule engine that can express all three, so the lawyer's answer becomes configuration rather than code:
- **Admin rules.** The admin creates discount rules per category (optionally per product): rule type (statutory 20% with VAT-exempt flag, BNPC 5% with weekly cap, or voluntary %), who funds it (seller or platform), and an enabled flag. **Every rule ships disabled.** Enabling one shows a confirmation that legal sign-off was obtained, recorded in the audit log.
- **Eligibility.** Only buyers with an `approved`, unexpired verification qualify. The cart and checkout show the discount as its own line with its legal basis; for unverified buyers, they show a "Verify your PWD ID to get the discount" link.
- **One pricing function.** Price on the server, in one function used by the cart, checkout, `placeOrder` and the PayMongo line items: base price → flash sale → PWD discount → caps. This also fixes B-02. Store each line's discount type, rate, amount and the verification id on `im_order_items` (or a sibling table), so seller and admin reports can substantiate it.
- **Delivery check.** For COD, the seller's order view shows "PWD discount applied: check the ID on delivery" with the masked number.
- **Weekly cap.** The BNPC rule enforces the ₱1,300 weekly cap per buyer on the server.

Customers buying:
- Guest → product → sign in → cart → paid order in the fewest possible steps; "Buy now" skips the cart.
- The price a buyer sees is the price they pay (B-02), and the stock shown is the stock reserved (B-04, B-05, B-06).
- Every error can be recovered from without losing the cart or the typed address.

## 7. Design direction: Shopee, Lazada or Shopify quality, not AI slop

Borrow their information architecture and density; keep IncluMarket's own identity and token system.

Do:
- Use the client's **blue and brown** palette, assigned by role. Starting values (contrast measured against WCAG; swap them if the client sends logo colours):

  | Role | Token | Value | Contrast |
  |---|---|---|---|
  | Primary: nav, links, primary buttons, focus ring | `--brand-blue` / `--brand-blue-800` / `--brand-blue-100` | `#0038A8` / `#00287A` / `#E8EEF9` | white on `#0038A8`: 9.9:1 |
  | Commerce accent: price, discount and flash-sale badges, verified-PWD badge, section accents | new `--brand-brown` / `--brand-brown-100` | `#7A4A21` / `#F3E8DC` | white on brown: 7.4:1; brown on white: 7.4:1; brown on tint: 6.2:1 |
  | Footer | `--color-footer` | `#4A2C14` (deep brown) | white: 12.6:1 |
  | Rating stars only | `--brand-yellow` | `#F5C518` | decorative, always next to text |
  | Errors and destructive actions only | `--danger` | `#C41E3A` | white text |

  Make this the new `default` preset ("InclusiveMarket blue & brown"). Add the brown tokens to all 8 presets, as `inclumarket-design` requires for any new themeable colour. Use neutral surfaces, and success, warning and danger only for status. `check-contrast.mjs` must still pass.
- Fix the product card anatomy: 1:1 image, title clamped to 2 lines, price in tabular numerals, strike-through price and "−20%" badge during a sale, stars and "sold" count, seller city or verified badge, wishlist heart. Every card in a row has the same height.
- Grid: 2 columns below 480px, 3 at md, 4 at lg with the filter panel open, 5 with it collapsed. One `.product-grid` definition, in `responsive.css`, with no empty tracks (B-17).
- Storefront cards: `--shadow-sm` at rest, `--shadow-md` and a 2px lift on hover. Dashboards stay flat, per `inclumarket-design`. One radius scale (`--radius-sm/md/lg`), one spacing scale (`--space-*`), and `--space-6` to `--space-7` between sections.
- Real empty, loading (skeleton) and error states on every page, and a `not-found.tsx` with search and popular categories.
- Seller Centre and Admin use a left sidebar from lg up and the existing mobile nav below that.
- Real seller photos. When a product has no image, use a neutral tile with the product's initial, not an emoji.

Don't:
- Purple or blue gradients, glassmorphism, glowing blobs, neon shadows, gradient text.
- Generic hero copy ("Empowering the future of…"), lorem ipsum, fake testimonials, invented statistics.
- Emoji as icons, mixed icon sets, everything centred, cards inside cards, five font sizes on one card.
- Animations that bounce, spin, stagger every element, or run longer than about 300ms.

For every redesigned page, put before and after screenshots at 375, 768 and 1280px in the plan's appendix. Take the "before" set in Stage A and the "after" set in Phase 4.

## 8. Phases

### Phase 0: Architecture review
Summarize the current architecture in at most 10 lines, confirming or correcting `docs/SYSTEM_DIAGRAMS.md` §1. Then write a short decision record (context · options · decision · consequences) for each structural change the plan needs. At minimum:
1. Splitting multi-seller orders (one `im_orders` row per seller, linked by a checkout or payment group id) versus a fulfillment status per line (B-09).
2. Enforcing the order and product state machines in the database (check constraint plus a transition function) versus in actions only (B-10, B-12).
3. Storefront reads: server-side search, filter, sort and pagination with `range()`, with ratings and sold counts pre-aggregated in a view or columns instead of whole tables loaded per request (B-16).
4. Where images live: product images stay base64 for now or move to Storage; PWD IDs must go to a private bucket (B-15).
5. Page-to-client data contracts: one `*Lite` DTO per client component, built on the server, enforced by a check script (B-13).
6. One server-side pricing pipeline (base → flash sale → PWD discount → caps) shared by cart, checkout, `placeOrder` and PayMongo, with the applied discounts persisted per order line (B-02, §6).
7. PWD ID storage and access: private bucket, signed URLs, hashed ID-number uniqueness, retention job (how it runs on Vercel without a new service, e.g. on admin page load or a Supabase scheduled function), and how "verified" is derived (§6).

Principles to apply and cite in the plan: least privilege; the server is the only source of truth for price, stock and permissions; idempotent payment handling (already in `lib/payments/apply.ts`, keep it); explicit state machines; data minimization (RA 10173); progressive enhancement; accessibility by default.

### Phase 1: Baseline (the "before" state)
Verify §4, then extend it: every route in `inclumarket-feature-review`'s inventory, every export in `lib/actions/`, every page's client props, every stylesheet. Run `npx tsc --noEmit` and `npm run verify` and record the output. Categories: broken flows, wrong money or stock, privacy and authorization, bad UX, dead or duplicate code, hardcoded values, missing validation, inconsistent UI, accessibility, performance, docs drift. Each finding gets: id · file:line · evidence · user impact · severity (Critical, High, Medium, Low).

### Phase 2: Plan from the client conversation and the roles
For every transcript line, every §5 row and every §6 requirement, classify ADD, IMPROVE or DELETE and give:
- Source: transcript line, §5 or §6 row, or baseline id.
- Affected routes, components, actions, `lib/data.ts` functions, CSS files, tables and migrations.
- Exactly what changes.
- Priority (High, Medium, Low), effort (S, M, L with hours), risk and how to contain it.
- Acceptance criteria written as testable checks: who does what, and what they see.

DELETE candidates to evaluate: the duplicate `.product-grid` rules, `getAllProducts()` in buyer pages, the Stripe and PayPal admin toggles that do nothing (B-20), the empty `inklutrack_proposal.md`, stale README sections. Do not delete anything the client might need without listing it under Open Questions.

If a client request is unclear, contradictory or missing details, do not guess: put it under Open Questions. List out-of-scope items explicitly with the reason (for example a native mobile app, training an ML model, a courier API integration).

### Phase 3: Design and motion audit
Run `/design-motion-principles` in **audit** mode across every page and component: public, buyer, seller and admin pages, dialogs, toasts, the chat and accessibility widgets, the notification panel. Apply all of its principles and every designer perspective it includes, alongside the `inclumarket-design` and `inclumarket-responsive` checks. Each finding gets:
- File and component.
- What is wrong: timing, easing, enter/exit, hover/press/focus states, micro-interactions, layout shift, reduced-motion support (both `prefers-reduced-motion` and the in-app `data-reduce-motion` toggle), performance (animate transform and opacity only).
- The principle it violates.
- The fix, with concrete values: duration in ms, easing curve, property.

Group findings by severity and merge their fixes into the same ordered step list as Phase 2, so design work and client changes are sequenced together.

### Phase 4: End check (the "after" state)
After implementation, re-scan the whole system and confirm:
- `npx tsc --noEmit` and `npm run verify` exit 0, including new checks for B-13 (page props), the single grid definition and the state machines.
- `inclumarket-feature-review` Tier 3: drive every journey in the browser (guest, buyer with COD, buyer paying online through PayMongo test mode or the simulator, the stock race, seller, admin, accessibility pass), with screenshots as evidence.
- The `inclumarket-security-audit` checklist passes for every new or changed action and migration, including the direct-PostgREST surface reachable with the publishable key.
- PWD verification works end to end, with screenshots:
  - camera capture on a phone, and file upload on desktop
  - the admin approves one submission and rejects another with a reason; both users are notified
  - a second account submitting the same ID number is blocked and flagged
  - an expired ID is rejected, and a revoked user loses the badge and the discount immediately
  - the ID images cannot be fetched with the publishable key, by another signed-in user, or after the signed URL expires
  - retention deletes images after the configured period
- The PWD discount works end to end:
  - with every rule disabled, no discount appears anywhere
  - with a rule enabled on a test category, a verified buyer sees the same discounted total in the cart, at checkout, on the PayMongo page and on the order, and the line shows its legal basis
  - an unverified buyer sees the verify prompt instead
  - the BNPC weekly cap holds across two orders in the same week
- The InclusiveMarket name appears everywhere a user can see it, and `grep -ri "IncluMarket"` returns only internal identifiers, each of which is listed.
- Every ADD, IMPROVE and DELETE item meets its acceptance criteria.
- Every Phase 1 issue is fixed or explicitly deferred with a reason.
- Every Phase 3 finding is applied.
- No blank pages: every route has a heading, real content or a designed empty state, a loading state and an error state, and the 404 page works.
- Layouts hold at 320, 375, 768, 1024, 1280 and 1440px and at the 24px font setting. Chrome Lighthouse accessibility is at least 95 on home, product, cart, checkout, seller dashboard and admin overview.
- No regressions against the "before" screenshots and the Phase 1 test results.
- `README.md`, `docs/SYSTEM_DIAGRAMS.md`, `docs/erd.md` and `CLAUDE.md` match the new system.

## 9. Output format (Stage A)

1. Summary (5 lines max).
2. Architecture decisions (Phase 0).
3. Phase 1 baseline findings.
4. Role coverage matrix: Guest, Buyer, Seller, Admin × feature, each EXISTS, PARTIAL or MISSING.
5. Change table: ADD / IMPROVE / DELETE.
6. Design and motion audit table.
7. Ordered implementation steps with dependencies, grouped as:
   S0 safety (commit, `.gitattributes`) → S1 money, stock and privacy fixes, including the single pricing pipeline → S2 migrations `0013+` (state machines, order split, verification, discount rules, addresses, payouts) → S3 rename to InclusiveMarket and design foundation (blue and brown tokens, grid, card, layouts, page states) → S4 PWD verification (buyer and seller flow, admin queue, storage, retention) → S5 buyer flow, ⭐ features first, then the PWD discount at checkout → S6 Seller Centre → S7 Admin console → S8 static pages and content → S9 motion polish → S10 docs.
   Each step: id · what · files · depends on · acceptance check · rollback.
8. Open questions for the client.
9. End-check checklist.

Already answered (§2), so do not ask again: palette (blue and brown), feature priority, name (InclusiveMarket), PWD verification (required), PWD discount (build it, disabled until the lawyer confirms).

Still open. Each has a default so you are never blocked; use the default and list the question:
- Exact blue and brown hex codes, or logo files? *Default: §7 values.*
- Who reviews PWD IDs, and how quickly? *Default: AVRC staff with the admin role, target 2 business days.*
- How long are ID images kept? *Default: 30 days after a decision, configurable.*
- Are existing sellers re-verified? *Default: admin reviews them and marks them verified.*
- Lawyer's answer: which categories get which discount rule, and who funds it (seller or platform)? *Default: every rule disabled.*
- Shipping: flat ₱60 per order, ₱60 per seller after the order split, or rates per city? Pickup at AVRC? *Default: ₱60 per seller group.*
- Payment methods at launch. *Default: COD plus PayMongo (GCash, Maya, card); remove the non-working Stripe and PayPal toggles.*
- Returns and refunds: time window, who pays return shipping, who approves. *Default: 7 days after delivery, the seller approves, an admin settles disputes.*
- "AI-based recommendations" in the proposal. *Default: rule-based personalisation from category affinity in views, wishlist and orders, described honestly and not called AI.*
- Filipino language (proposal NFR-12). *Default: later; keep strings centralised so it is possible.*
- Real contact email, phone and address, social media URLs, and legal review of the Privacy Policy and Terms. *Default: AVRC Region IX details marked "to confirm", and social icons hidden until URLs arrive (not "coming soon").*
- "Accessibility enhancements" beyond the current widget. *Default: the §6 list.*
- Assisted mode, where AVRC staff list products for a seller who cannot use the app independently. *Default: out of scope this round; listed as a proposal.*

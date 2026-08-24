---
name: inclumarket-feature-review
description: Verify that every button, form and feature in IncluMarket actually works end to end — not just that it compiles. Use when asked to "review the app", "does everything work", "test all the buttons", "check every feature", "QA pass", "verify my changes", or before a demo or capstone submission. Builds a route and control inventory, finds dead controls and orphan actions, then drives the real app in a browser.
license: MIT
metadata:
  project: inklumarket-next
  version: "1.0"
---

# IncluMarket Feature Review

## When to Use This Skill

Before a demo, before a defence, before merging a large change, or whenever
someone asks whether the app actually works.

## Read this first: `npm run smoke` does not prove anything works

`scripts/smoke.mjs` is a **string-matching harness**, not a functional test. It
does things like:

```js
assert(layout.includes("AccessibilityWidget"), "layout mounts AccessibilityWidget");
assert(responder.includes("shipping"), "responder has domain rules");
```

It reads files and greps them. **It would pass on an app where every button is
dead**, because it never renders anything or clicks anything.

That does not make it useless — it is fast, dependency-free, and its
`tsc --noEmit` gate is real. Treat it as a structural regression net, and never
as evidence that a feature works.

---

## The four tiers

Run them in order. Each is cheap relative to the one after it.

### Tier 0 — build gates (seconds)

```bash
npx tsc --noEmit
npm run build
npm run smoke
```

A red build makes everything below meaningless.

### Tier 1 — static inventory (seconds)

```bash
node .claude/skills/inclumarket-feature-review/scripts/inventory.mjs
```

This is what makes "every button" a finite job rather than an unbounded one. It
parses `app/**/page.tsx` and `components/*.tsx` and reports:

- every route, with the `requireRole()` guard protecting it
- every `<button>`, `<Link href>`, `<form>` and click handler, per file
- every exported server action, and which components call it
- **orphan actions** — exported, never called from any component. Either dead
  code or a feature with no UI.
- **dead controls** — an `onClick` whose handler body is empty, or a `<button>`
  with neither `onClick` nor `type="submit"`.

Take the output as the checklist for Tier 3.

### Tier 2 — the enforcing scripts (seconds)

```bash
node .claude/skills/inclumarket-security-audit/scripts/audit-actions.mjs
node .claude/skills/inclumarket-design/scripts/check-contrast.mjs
node .claude/skills/inclumarket-responsive/scripts/audit-responsive.mjs
```

These catch the classes of bug that have actually shipped here: an
unauthenticated server action, invisible text, a fixed offset that breaks at the
24px font setting.

### Tier 3 — drive the real app

Use the `browser-automation` skill (already installed) rather than adding
Playwright. This project has 13 dependencies and no test infrastructure;
introducing a test suite means maintaining one instead of building features.
The `pw:` plugin skills exist if you later want an HTML report as a submission
artifact — that is the only reason to reach for them on a capstone timeline.

```bash
npm run dev      # then drive http://localhost:3000
```

Capture console errors and failed network requests on every page. A page that
renders but logs a 500 is not working.

---

## The six journeys

These must all pass before a demo. Each ends in a **database side effect** you
can verify, not just a visual change.

**1. Guest**
Land on `/home` → browse → open a product → try Add to cart → redirected to
`/login`. *Verify:* no cart row created.

**2. Buyer, cash on delivery**
Sign in → wishlist a product → add to cart → change quantity → checkout with
name/address/city/phone → place order.
*Verify:* `im_orders` row has `shipping_name`, `shipping_address`,
`shipping_city`, `shipping_phone` **populated** and `payment_status='unpaid'`;
cart is empty; the order appears in `/buyer/orders` with a status timeline.
*(These fields were silently discarded before — this is the regression test.)*

**3. Buyer, online payment**
Checkout choosing "Pay online" → PayMongo test page → pay.
*Verify:* webhook fires, `im_transactions` row exists, `payment_status='paid'`,
cart cleared, buyer and seller emails logged.
Then **replay the same webhook body** and verify nothing changes — that is the
idempotency gate.
Then start a payment and **abandon it**: cart must survive and stock must be
restored.

**4. Stock**
Add a quantity larger than stock and check out.
*Verify:* the order is **rejected** with a message naming the item, and stock is
unchanged. *(This used to silently succeed and floor stock at 0.)*

**5. Seller**
Create a product with 2 variants and 1 image → appears as `pending` → admin
approves → visible in the catalog → advance an order to `shipped`.
*Verify:* buyer sees the notification and the timeline entry.
Also try uploading a 5 MB file: it must be rejected **server-side**.

**6. Admin**
Approve/flag a product → suspend a user → export an `.xlsx` → change the theme
preset.
*Verify:* the suspended user can no longer sign in *(never enforced before)*;
the export downloads and opens; the theme applies site-wide.

**7. Accessibility pass**
Complete journey 2 with **no mouse**. Then set the accessibility panel to 24px
and high contrast and do it again at a 320px viewport.
*Verify:* skip link moves focus; every tab strip responds to arrow keys; every
table's Actions column is reachable; the "Proceed to checkout" bar is not
covered by the floating buttons.

---

## Test data hygiene

Journeys 2, 5 and 6 create real auth users, real orders and real payment
records. **Run them against a separate Supabase project or a scratch schema,
never production.** Provision accounts with `npm run provision-users`, which
reads `SEED_ACCOUNT_PASSWORD` from the environment and refuses to run against a
non-localhost `NEXT_PUBLIC_SITE_URL` without `ALLOW_SEED_IN_PROD=1`.

---

## Reporting format

| Control | Location | Expected | Actual | Status |
|---|---|---|---|---|
| Place order | `components/CheckoutClient.tsx:59` | Persists shipping, returns order id | … | pass / fail |

Then two sections that matter more than the table:

- **Dead controls** — from the Tier 1 orphan report.
- **Spec claims with no code** — features documented in
  `docs/SYSTEM_DIAGRAMS.md` or `README.md` that do not exist. This repo has a
  history of documentation describing behaviour that was never implemented
  (middleware route protection, checkout stock validation, seller payouts,
  account suspend/restore). Check claims against code, not against other docs.

## Known gaps to check against

Still unimplemented at the time of writing — do not report these as new:

- Seller payouts: `im_payouts` has a full schema and RLS, zero application code
- PWD ID upload and verification: `pwd_id_url` is never read or written
- Server-synced accessibility prefs: `im_ui_prefs` is never touched;
  preferences are localStorage-only and do not follow a user across devices
- Newsletter unsubscribe: subscribe works, there is no way out
- Order-status transitions are unordered: a seller can jump `pending` straight
  to `delivered`
